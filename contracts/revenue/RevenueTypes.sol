// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

/// @dev Destination identity is immutable for a vault. The chain is part of the key,
/// even though the destination receiver obtains it from block.chainid.
struct RevenueEnvelope {
    bytes32 payoutId;
    bytes32 communityKey;
    bytes32 platformId;
    bytes32 communityId;
}

struct RevenueBridgeRequest {
    uint256 destinationChainId;
    address destinationReceiver;
    address refundRecipient;
    uint256 amount;
    uint256 minAmountOut;
    RevenueEnvelope envelope;
}

library RevenueIdentity {
    function key(bytes32 platformId, uint256 chainId, bytes32 communityId) internal pure returns (bytes32) {
        return keccak256(abi.encode(platformId, chainId, communityId));
    }
}

interface ICommunityTransferAdapter {
    /// @dev token == address(0) denotes native ETH. ERC20 delivery pulls exactly
    /// amount from the receiver; an adapter must revert on any incomplete delivery.
    function transferToCommunity(bytes32 communityId, bytes32 payoutId, address token, uint256 amount) external payable;
}

interface IRevenueBridgeAdapter {
    function bridgeETH(RevenueBridgeRequest calldata request, bytes calldata quoteData)
        external
        payable
        returns (bytes32 transferId, uint256 minimumOutput);
}

interface ICommunityRevenueReceiver {
    function receiveLocal(RevenueEnvelope calldata envelope) external payable returns (bytes32 receiptId);
    function receiveNative(RevenueEnvelope calldata envelope) external payable returns (bytes32 receiptId);
    function receiveToken(RevenueEnvelope calldata envelope, address token, uint256 amount)
        external
        returns (bytes32 receiptId);
}

interface IRevenueETHx {
    function balanceOf(address account) external view returns (uint256);
    function downgradeToETH(uint256 amount) external;
}

interface IRevenueWETH {
    function balanceOf(address account) external view returns (uint256);
    function withdraw(uint256 amount) external;
}
