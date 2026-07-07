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

    /// @notice Returns the Juicebox multi-terminal address for RevNet payments.
    /// @dev In v1.2 Leaderboards this is read from the factory, not stored per-leaderboard.
    ///      Only the factory admin (Markee Cooperative) can change it.
    function revNetTerminal() external view returns (address);

    /// @notice Returns the Markee Cooperative RevNet project ID.
    /// @dev In v1.2 Leaderboards this is read from the factory, not stored per-leaderboard.
    ///      Only the factory admin (Markee Cooperative) can change it.
    function revNetProjectId() external view returns (uint256);

    function platformFeeReceiver() external view returns (address);
    function percentToPlatformFeeReceiver() external view returns (uint256);
}

/// @notice Interface for reading RevNet config from a v1.2 LeaderboardFactory.
/// @dev Leaderboard.revNetTerminal() and revNetProjectId() delegate to this so the
///      Coop controls routing for all leaderboards from one place.
interface ILeaderboardFactory {
    function revNetTerminal() external view returns (address);
    function revNetProjectId() external view returns (uint256);
}
