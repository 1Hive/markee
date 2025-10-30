// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @notice Interface for Juicebox Multi Terminal V5
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
