// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueBridgeBase} from "./RevenueBridgeBase.sol";
import {RevenueBridgeRequest, IRevenueBridgeAdapter} from "../RevenueTypes.sol";

interface IRevenueAcrossSpokePool {
    function depositV3Now(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 fillDeadlineOffset,
        uint32 exclusivityDeadline,
        bytes calldata message
    ) external payable;
}

/// @notice Gardens Across execution logic with a platform-neutral message.
contract AcrossRevenueBridgeAdapter is RevenueBridgeBase, IRevenueBridgeAdapter {
    struct Quote {
        uint256 outputAmount;
        uint32 fillDeadline;
    }
    address public immutable spokePool;
    address public immutable wrappedETH;
    mapping(uint256 => address) public destinationTokens;
    event DestinationTokenSet(uint256 indexed chainId, address token);

    constructor(address owner_, address router_, address spokePool_, address wrappedETH_)
        RevenueBridgeBase(owner_, router_)
    {
        if (spokePool_.code.length == 0 || wrappedETH_.code.length == 0) revert InvalidRoute();
        spokePool = spokePool_;
        wrappedETH = wrappedETH_;
    }

    function setDestinationToken(uint256 chainId, address token) external onlyOwner {
        if (chainId == 0) revert InvalidRoute();
        destinationTokens[chainId] = token;
        emit DestinationTokenSet(chainId, token);
    }

    function bridgeETH(RevenueBridgeRequest calldata r, bytes calldata data)
        external
        payable
        nonReentrant
        returns (bytes32, uint256)
    {
        _validateRequest(r);
        Quote memory q = abi.decode(data, (Quote));
        address outputToken = destinationTokens[r.destinationChainId];
        if (
            outputToken == address(0) || q.outputAmount < r.minAmountOut || q.outputAmount > r.amount
                || q.fillDeadline <= block.timestamp || q.fillDeadline > block.timestamp + 6 hours
        ) revert InvalidRoute();
        IRevenueAcrossSpokePool(spokePool).depositV3Now{value: r.amount}(
            r.refundRecipient,
            r.destinationReceiver,
            wrappedETH,
            outputToken,
            r.amount,
            q.outputAmount,
            r.destinationChainId,
            address(0),
            uint32(q.fillDeadline - block.timestamp),
            0,
            abi.encode(r.envelope)
        );
        _refund(r.refundRecipient, msg.value - r.amount);
        emit BridgeStarted(r.envelope.payoutId, r.destinationChainId, r.destinationReceiver, r.amount, q.outputAmount);
        return (r.envelope.payoutId, q.outputAmount);
    }
}
