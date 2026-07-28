// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

/// @notice The surface StreamingLeaderboardFactory calls on a freshly cloned board, plus a few getters
///         useful to external integrators and the frontend.
/// @dev Frozen cross-version ABI. The factory address holds the Superfluid registration grant and is
///      never redeployed, so every board version installed through setImplementations must satisfy
///      this exactly; each board declares `is IStreamingLeaderboard` so the compiler enforces it.
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

    function topMarkee() external view returns (address);

    function aggregateRate(address markee) external view returns (uint256);

    /// @notice Permissionless decay poke: flip #1 to a challenger that has outbid the incumbent.
    function claimTop(address challenger) external;

    /// @notice Live (unsettled) ETHx owed to a backer, including accrual up to the current block.
    function pendingSettlement(address backer) external view returns (uint256);

    /// @notice Settle the accrued RevNet share owed to each given backer (permissionless).
    function settle(address[] calldata backers) external;
}

/// @notice The Superfluid wiring the factory reads off a board implementation: to register each clone
///         as a SuperApp, and to check the implementation was built against the same host and
///         SuperToken the factory holds.
/// @dev Separate from IStreamingLeaderboard because these three come from CFASuperAppBase, whose HOST
///      immutable and getConfigWord are not virtual and so cannot be re-declared by a board.
interface ISuperAppWiring {
    function HOST() external view returns (ISuperfluid);

    function isAcceptedSuperToken(ISuperToken superToken) external view returns (bool);

    function getConfigWord(bool activateOnCreated, bool activateOnUpdated, bool activateOnDeleted)
        external
        pure
        returns (uint256);
}

/// @notice The clonable-Markee surface the factory probes before accepting a Markee implementation.
/// @dev The factory never mints a Markee itself, it only hands markeeImplementation to each board at
///      initialize, so this exists purely to reject an address that is not an initializable Markee.
interface IMarkeeImplementation {
    function initialized() external view returns (bool);
}
