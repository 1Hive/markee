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
/// @dev Markee reads beneficiaryAddress() dynamically at payment time so that a single
///      admin update on the strategy propagates to all connected Markees instantly.
interface IPricingStrategy {
    /// @notice Returns the address that receives the community share of every payment
    function beneficiaryAddress() external view returns (address);
}
