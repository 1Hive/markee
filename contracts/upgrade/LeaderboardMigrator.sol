// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { BoardMigratorBase, ILegacyBoard } from "./BoardMigratorBase.sol";

interface ILegacyLeaderboard is ILegacyBoard {
    function factory() external view returns (address);
    function minimumPrice() external view returns (uint256);
    function maxMessageLength() external view returns (uint256);
    function maxNameLength() external view returns (uint256);
}

interface ILeaderboardRegistry {
    function isFactoryLeaderboard(address board) external view returns (bool);
}

interface IMigrationLeaderboardFactory {
    function createMigrationLeaderboard(address seedOwner, address beneficiaryAddress, string calldata name)
        external
        returns (address leaderboardAddress, address seedMarkeeAddress);
}

interface ISuccessorLeaderboard {
    function migrateFromLegacy(address oldMarkee) external returns (address newMarkeeAddress);
    function setMinimumPrice(uint256 newPrice) external;
    function setMaxMessageLength(uint256 newLength) external;
    function setMaxNameLength(uint256 newLength) external;
    function handOffAdmin(address newAdmin) external;
}

/// @title LeaderboardMigrator
/// @notice Forced migration of v1.3 lump-sum boards to beacon-backed boards on a v1.4 factory. The
///         successor's seed Markee belongs to the legacy admin, and each legacy Markee arrives through
///         the successor's own migrateFromLegacy, which re-reads the legacy Markee's on-chain state.
/// @dev Must be set as the target factory's migrator. The legacy factory freeze (SunsetTerminal) is a
///      separate factory-admin step once a factory's boards are all migrated.
contract LeaderboardMigrator is BoardMigratorBase {
    IMigrationLeaderboardFactory public immutable TARGET_FACTORY;

    error ZeroTargetFactory();

    constructor(address _owner, IMigrationLeaderboardFactory _targetFactory) BoardMigratorBase(_owner) {
        if (address(_targetFactory) == address(0)) revert ZeroTargetFactory();
        TARGET_FACTORY = _targetFactory;
    }

    function _isSourceBoard(address _legacyBoard) internal view override returns (bool) {
        address legacyFactory = ILegacyLeaderboard(_legacyBoard).factory();
        return isSourceFactory[legacyFactory] && ILeaderboardRegistry(legacyFactory).isFactoryLeaderboard(_legacyBoard);
    }

    function _createSuccessor(address _legacyBoard) internal override returns (address successor) {
        ILegacyLeaderboard legacy = ILegacyLeaderboard(_legacyBoard);
        (successor,) = TARGET_FACTORY.createMigrationLeaderboard(
            legacy.admin(), legacy.beneficiaryAddress(), legacy.leaderboardName()
        );
        ISuccessorLeaderboard board = ISuccessorLeaderboard(successor);
        board.setMinimumPrice(legacy.minimumPrice());
        board.setMaxMessageLength(legacy.maxMessageLength());
        board.setMaxNameLength(legacy.maxNameLength());
    }

    function _copyMarkee(address _successor, address _legacyMarkee) internal override returns (address) {
        return ISuccessorLeaderboard(_successor).migrateFromLegacy(_legacyMarkee);
    }

    function _afterCopy(address, address[] memory) internal override {}

    function _handOff(address _successor, address _legacyAdmin) internal override {
        ISuccessorLeaderboard(_successor).handOffAdmin(_legacyAdmin);
    }
}
