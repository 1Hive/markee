// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {RevenueBridgeBase} from "./RevenueBridgeBase.sol";
import {RevenueBridgeRequest, IRevenueBridgeAdapter} from "../RevenueTypes.sol";

/// @notice Squid's provider bundles contain arbitrary swap calls. An explicitly
/// trusted route auditor approves the COMPLETE bundle, including its destination
/// post-hook and refunds. The keeper alone cannot redirect a reviewed route.
/// @dev EIP-1271 allows governance to be the signer; a separate reviewed quote
/// service may be authorized. An API's self-reported expected output is not proof.
contract SquidRevenueBridgeAdapter is RevenueBridgeBase, EIP712, IRevenueBridgeAdapter {
    struct Quote {
        uint256 minimumOutput;
        uint256 executionValue;
        uint256 deadline;
        bytes routerCalldata;
        bytes signature;
    }
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "SquidRevenueQuote(bytes32 requestHash,bytes32 calldataHash,uint256 minimumOutput,uint256 executionValue,uint256 deadline)"
    );
    address public immutable squidRouter;
    address public quoteSigner;
    mapping(bytes32 => bool) public usedQuotes;
    event QuoteSignerSet(address indexed signer);
    event ReviewedRouteExecuted(bytes32 indexed payoutId, bytes32 indexed digest, bytes32 calldataHash);

    constructor(address owner_, address router_, address squidRouter_)
        RevenueBridgeBase(owner_, router_)
        EIP712("MarkeeSquidRevenue", "1")
    {
        if (squidRouter_.code.length == 0) revert InvalidRoute();
        squidRouter = squidRouter_;
        quoteSigner = owner_;
    }

    function setQuoteSigner(address signer) external onlyOwner {
        quoteSigner = signer; // zero pauses new route approvals
        emit QuoteSignerSet(signer);
    }

    function quoteDigest(RevenueBridgeRequest calldata r, Quote memory q) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    keccak256(abi.encode(r)),
                    keccak256(q.routerCalldata),
                    q.minimumOutput,
                    q.executionValue,
                    q.deadline
                )
            )
        );
    }

    function bridgeETH(RevenueBridgeRequest calldata r, bytes calldata data)
        external
        payable
        nonReentrant
        returns (bytes32, uint256)
    {
        _validateRequest(r);
        Quote memory q = abi.decode(data, (Quote));
        if (
            q.minimumOutput < r.minAmountOut || q.minimumOutput > r.amount || q.executionValue < r.amount
                || q.executionValue > msg.value || q.routerCalldata.length < 4 || q.deadline < block.timestamp
                || q.deadline > block.timestamp + 1 hours || quoteSigner == address(0)
        ) {
            revert InvalidRoute();
        }
        bytes32 digest = quoteDigest(r, q);
        if (usedQuotes[digest] || !SignatureChecker.isValidSignatureNow(quoteSigner, digest, q.signature)) {
            revert InvalidRoute();
        }
        usedQuotes[digest] = true;
        uint256 preexisting = address(this).balance - msg.value;
        (bool success,) = squidRouter.call{value: q.executionValue}(q.routerCalldata);
        if (!success) revert InvalidRoute();
        _refund(r.refundRecipient, address(this).balance - preexisting);
        emit ReviewedRouteExecuted(r.envelope.payoutId, digest, keccak256(q.routerCalldata));
        emit BridgeStarted(r.envelope.payoutId, r.destinationChainId, r.destinationReceiver, r.amount, q.minimumOutput);
        return (r.envelope.payoutId, q.minimumOutput);
    }
}
