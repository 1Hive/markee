// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @title Streaming strategy interfaces
/// @notice The v1.3 strategy interfaces (IPricingStrategy, ILeaderboardFactory, IJBMultiTerminal)
///         are reused unchanged — import them directly from ../v1.3/Interfaces.sol. This file only
///         declares the streaming-specific surface the factory needs on a freshly cloned leaderboard.

/// @notice Surface the StreamingLeaderboardFactory calls on a freshly cloned StreamingLeaderboard,
///         plus a couple of getters useful to external integrators / the frontend.
interface IStreamingLeaderboard {
    function initialize(
        address admin,
        address beneficiaryAddress,
        string calldata leaderboardName,
        address markeeImplementation,
        uint256 minimumMonthlyRate,
        uint256 maxMessageLength,
        uint256 maxNameLength,
        address seedOwner
    ) external returns (address seedMarkeeAddress);

    function getConfigWord(bool activateOnCreated, bool activateOnUpdated, bool activateOnDeleted)
        external
        pure
        returns (uint256);

    function topMarkee() external view returns (address);

    function aggregateRate(address markee) external view returns (uint256);

    /// @notice Permissionless decay poke: flip #1 to a challenger that has outbid the incumbent.
    function claimTop(address challenger) external;

    /// @notice Permissionless poke: realign a Markee's outbound flow with its current aggregate after
    ///         the jail-safe termination callback deferred a buffer-needing adjustment.
    function syncMarkee(address markee) external;

    /// @notice Live (unsettled) ETHx owed to a backer, including accrual up to the current block.
    function pendingSettlement(address backer) external view returns (uint256);

    /// @notice Settle the accrued RevNet share owed to each given backer (permissionless).
    function settle(address[] calldata backers) external;
}
