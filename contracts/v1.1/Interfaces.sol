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
/// @dev Markee reads all five values dynamically at payment time — a single admin update on the
///      strategy propagates to every connected Markee instantly with no per-Markee migrations.
interface IPricingStrategy {
    /// @notice Returns the address that receives the beneficiary share of every payment
    function beneficiaryAddress() external view returns (address);

    /// @notice Returns the beneficiary share in basis points (10000 = 100%)
    function percentToBeneficiary() external view returns (uint256);

    /// @notice Returns true if the RevNet should receive the remaining share of each payment
    /// @dev When false, 100% of funds route to beneficiaryAddress regardless of percentToBeneficiary
    function revNetEnabled() external view returns (bool);

    /// @notice Returns the Juicebox multi-terminal address for RevNet payments
    /// @dev Only used when revNetEnabled is true. Admin updates this once when RevNet v6 is live.
    function revNetTerminal() external view returns (address);

    /// @notice Returns the Markee Cooperative RevNet project ID
    /// @dev Only used when revNetEnabled is true. Admin updates this once when RevNet v6 is live.
    function revNetProjectId() external view returns (uint256);
}
