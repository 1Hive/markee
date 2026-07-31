// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @notice Factory-controlled config every board proxies its RevNet and fee values through.
interface ILeaderboardFactory {
    function revNetTerminal() external view returns (address);
    function revNetProjectId() external view returns (uint256);
    function revNetEnabled() external view returns (bool);
    function percentToBeneficiary() external view returns (uint256);
    function platformFeeReceiver() external view returns (address);
    function percentToPlatformFeeReceiver() external view returns (uint256);
}
