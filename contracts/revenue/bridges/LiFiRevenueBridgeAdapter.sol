// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueBridgeBase} from "./RevenueBridgeBase.sol";
import {RevenueBridgeRequest, IRevenueBridgeAdapter, ICommunityRevenueReceiver} from "../RevenueTypes.sol";

/// @notice Port of Gardens' tightly decoded LI.FI/Stargate V2 route. Unsupported
/// provider route shapes fail closed; do not replace validation with a selector allowlist.
contract LiFiRevenueBridgeAdapter is RevenueBridgeBase, IRevenueBridgeAdapter {
    struct BridgeData {
        bytes32 transactionId;
        string bridge;
        string integrator;
        address referrer;
        address sendingAssetId;
        address receiver;
        uint256 minAmount;
        uint256 destinationChainId;
        bool hasSourceSwaps;
        bool hasDestinationCall;
    }

    struct SwapData {
        address callTo;
        address approveTo;
        address sendingAssetId;
        address receivingAssetId;
        uint256 fromAmount;
        bytes callData;
        bool requiresDeposit;
    }

    struct SendParam {
        uint32 dstEid;
        bytes32 to;
        uint256 amountLD;
        uint256 minAmountLD;
        bytes extraOptions;
        bytes composeMsg;
        bytes oftCmd;
    }

    struct MessagingFee {
        uint256 nativeFee;
        uint256 lzTokenFee;
    }

    struct NativeFee {
        address recipient;
        uint256 amount;
    }

    struct StargateData {
        uint16 assetId;
        SendParam sendParams;
        MessagingFee fee;
        address payable refundAddress;
    }

    struct Quote {
        uint256 minimumOutput;
        uint256 executionValue;
        uint256 deadline;
        bytes routerCalldata;
    }

    struct Destination {
        uint32 endpointId;
        bytes32 executor;
        address token;
        bytes32 optionsHash;
    }

    address public immutable liFiDiamond;
    address public feeCollector;
    address public feeRecipient;
    uint16 public stargateAssetId;
    bytes32 public integratorHash;
    mapping(uint256 => Destination) public destinations;
    event SourceRouteSet(address feeCollector, address feeRecipient, uint16 assetId, string integrator);
    event DestinationSet(
        uint256 indexed chainId, uint32 endpointId, bytes32 executor, address token, bytes32 optionsHash
    );

    constructor(address owner_, address router_, address diamond_) RevenueBridgeBase(owner_, router_) {
        if (diamond_.code.length == 0) revert InvalidRoute();
        liFiDiamond = diamond_;
    }

    function setSourceRoute(address collector, address recipient, uint16 assetId, string calldata integrator)
        external
        onlyOwner
    {
        if (collector.code.length == 0 || recipient == address(0) || assetId == 0 || bytes(integrator).length == 0) {
            revert InvalidRoute();
        }
        feeCollector = collector;
        feeRecipient = recipient;
        stargateAssetId = assetId;
        integratorHash = keccak256(bytes(integrator));
        emit SourceRouteSet(collector, recipient, assetId, integrator);
    }

    function setDestination(uint256 chainId, Destination calldata d) external onlyOwner {
        if (
            chainId == 0 || d.endpointId == 0 || d.executor == bytes32(0) || d.token == address(0)
                || d.optionsHash == bytes32(0)
        ) revert InvalidRoute();
        destinations[chainId] = d;
        emit DestinationSet(chainId, d.endpointId, d.executor, d.token, d.optionsHash);
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
                || q.executionValue > msg.value || q.deadline < block.timestamp
                || q.deadline > block.timestamp + 1 hours
        ) {
            revert InvalidRoute();
        }
        _validateRoute(r, q);
        uint256 preexisting = address(this).balance - msg.value;
        (bool success,) = liFiDiamond.call{value: q.executionValue}(q.routerCalldata);
        if (!success) revert InvalidRoute();
        _refund(r.refundRecipient, address(this).balance - preexisting);
        emit BridgeStarted(r.envelope.payoutId, r.destinationChainId, r.destinationReceiver, r.amount, q.minimumOutput);
        return (r.envelope.payoutId, q.minimumOutput);
    }

    function _validateRoute(RevenueBridgeRequest calldata r, Quote memory q) internal view {
        if (_selector(q.routerCalldata) != 0xa6010a66) revert InvalidRoute();
        (BridgeData memory b, SwapData[] memory swaps, StargateData memory s) =
            abi.decode(_arguments(q.routerCalldata), (BridgeData, SwapData[], StargateData));
        Destination memory d = destinations[r.destinationChainId];
        if (
            feeCollector == address(0) || b.transactionId != r.envelope.payoutId || b.sendingAssetId != address(0)
                || b.receiver != address(this) || b.referrer != address(0)
                || b.destinationChainId != r.destinationChainId || !b.hasSourceSwaps || !b.hasDestinationCall
                || swaps.length != 1 || keccak256(bytes(b.bridge)) != keccak256("stargateV2")
                || keccak256(bytes(b.integrator)) != integratorHash || swaps[0].callTo != feeCollector
                || swaps[0].approveTo != feeCollector || swaps[0].sendingAssetId != address(0)
                || swaps[0].receivingAssetId != address(0) || swaps[0].fromAmount != r.amount
                || !swaps[0].requiresDeposit || b.minAmount == 0 || b.minAmount > r.amount || d.executor == bytes32(0)
                || s.sendParams.to != d.executor || s.sendParams.dstEid != d.endpointId || s.assetId != stargateAssetId
                || s.sendParams.amountLD != b.minAmount || s.sendParams.minAmountLD != q.minimumOutput
                || s.refundAddress != address(this) || s.fee.lzTokenFee != 0
                || q.executionValue != r.amount + s.fee.nativeFee || s.sendParams.oftCmd.length != 0
                || keccak256(s.sendParams.extraOptions) != d.optionsHash
        ) {
            revert InvalidRoute();
        }
        if (_selector(swaps[0].callData) != bytes4(keccak256("forwardNativeFees((address,uint256)[])"))) {
            revert InvalidRoute();
        }
        NativeFee[] memory fees = abi.decode(_arguments(swaps[0].callData), (NativeFee[]));
        if (fees.length != 1 || fees[0].recipient != feeRecipient || fees[0].amount + b.minAmount != r.amount) {
            revert InvalidRoute();
        }
        (bytes32 id, SwapData[] memory calls, address residualReceiver) =
            abi.decode(s.sendParams.composeMsg, (bytes32, SwapData[], address));
        // Any exceptional destination dust stays recoverable on the destination
        // receiver. Never use a source-only vault address on the destination chain.
        if (id != r.envelope.payoutId || calls.length != 1 || residualReceiver != r.destinationReceiver) {
            revert InvalidRoute();
        }
        SwapData memory c = calls[0];
        bytes memory expected =
            abi.encodeCall(ICommunityRevenueReceiver.receiveToken, (r.envelope, d.token, q.minimumOutput));
        if (
            c.callTo != r.destinationReceiver || c.approveTo != r.destinationReceiver || c.sendingAssetId != d.token
                || c.receivingAssetId != d.token || c.fromAmount != q.minimumOutput || !c.requiresDeposit
                || keccak256(c.callData) != keccak256(expected)
        ) revert InvalidRoute();
    }

    function _selector(bytes memory data) internal pure returns (bytes4 selector) {
        if (data.length < 4) revert InvalidRoute();
        assembly ("memory-safe") { selector := mload(add(data, 32)) }
    }

    function _arguments(bytes memory data) internal pure returns (bytes memory result) {
        if (data.length < 4) revert InvalidRoute();
        result = new bytes(data.length - 4);
        assembly ("memory-safe") {
            mcopy(add(result, 32), add(data, 36), sub(mload(data), 4))
        }
    }
}
