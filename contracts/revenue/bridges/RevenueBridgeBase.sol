// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RevenueBridgeRequest, RevenueIdentity} from "../RevenueTypes.sol";

abstract contract RevenueBridgeBase is Ownable2Step, ReentrancyGuard {
    address public immutable router;
    error Unauthorized();
    error InvalidRoute();
    error RefundFailed();
    event BridgeStarted(
        bytes32 indexed payoutId,
        uint256 indexed destinationChainId,
        address indexed receiver,
        uint256 inputAmount,
        uint256 minimumOutput
    );

    constructor(address owner_, address router_) Ownable(owner_) {
        if (router_.code.length == 0) revert InvalidRoute();
        router = router_;
    }
    receive() external payable {}

    function _validateRequest(RevenueBridgeRequest calldata r) internal view {
        if (msg.sender != router) revert Unauthorized();
        if (
            r.amount == 0 || msg.value < r.amount || r.minAmountOut == 0 || r.minAmountOut > r.amount
                || r.destinationChainId == 0 || r.destinationChainId == block.chainid
                || r.destinationReceiver == address(0) || r.refundRecipient == address(0)
                || r.envelope.payoutId == bytes32(0) || r.envelope.platformId == bytes32(0)
                || r.envelope.communityId == bytes32(0)
                || r.envelope.communityKey
                    != RevenueIdentity.key(r.envelope.platformId, r.destinationChainId, r.envelope.communityId)
        ) {
            revert InvalidRoute();
        }
    }

    function _refund(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = payable(recipient).call{value: amount}("");
        if (!success) revert RefundFailed();
    }

    /// @notice Explicit recovery for unsolicited/delayed native refunds. Normal
    /// route-scoped refunds go to the source vault during bridgeETH.
    function recoverNative(address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRoute();
        _refund(recipient, address(this).balance);
    }
}
