// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @notice Minimal interface for the Juicebox Multi-Terminal
interface IJBMultiTerminal {
    function pay(
        uint256 projectId,
        address token,
        uint256 amount,
        address beneficiary,
        uint256 minReturnedTokens,
        string calldata memo,
        bytes calldata metadata
    ) external payable returns (uint256 beneficiaryTokenCount);
}

/// @notice Required interface for any contract acting as a pricingStrategy on a Markee.
/// @dev Markee reads all values dynamically at payment time — a single admin update on the
///      strategy propagates to every connected Markee instantly with no per-Markee migrations.
interface IPricingStrategy {
    function beneficiaryAddress() external view returns (address);
    function percentToBeneficiary() external view returns (uint256);
    function revNetEnabled() external view returns (bool);
    function revNetTerminal() external view returns (address);
    function revNetProjectId() external view returns (uint256);
    function platformFeeReceiver() external view returns (address);
    function percentToPlatformFeeReceiver() external view returns (uint256);
}

/// @notice Interface for reading factory-controlled config from a v1.3 LeaderboardFactory.
/// @dev All v1.3 Leaderboards proxy every RevNet and fee value through this interface.
///      The Markee Cooperative updates all leaderboards on a factory with a single transaction —
///      including an emergency RevNet disable if a vulnerability is discovered.
interface ILeaderboardFactory {
    function revNetTerminal() external view returns (address);
    function revNetProjectId() external view returns (uint256);
    function revNetEnabled() external view returns (bool);
    function percentToBeneficiary() external view returns (uint256);
    function platformFeeReceiver() external view returns (address);
    function percentToPlatformFeeReceiver() external view returns (uint256);
}
