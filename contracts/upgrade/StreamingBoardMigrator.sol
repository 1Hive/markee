// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { BoardMigratorBase, ILegacyBoard, ILegacyMarkee } from "./BoardMigratorBase.sol";

interface ILegacyStreamingBoard is ILegacyBoard {
    function factory() external view returns (address);
    function minimumMonthlyRate() external view returns (uint256);
    function legacyFloorMonths() external view returns (uint256);
}

interface IStreamingFactoryRegistry {
    function isFactoryLeaderboard(address board) external view returns (bool);
    function boardPlatform(address board) external view returns (string memory name, string memory id);
    function createLeaderboard(
        address beneficiaryAddress,
        string calldata leaderboardName,
        string calldata platformName,
        string calldata platformId
    ) external returns (address leaderboardAddress, address seedMarkeeAddress);
}

interface ISuccessorStreamingBoard {
    function markeeImplementation() external view returns (address);
    function registerExistingMarkees(address[] calldata markees) external;
    function setMinimumMonthlyRate(uint256 newRate) external;
    function setLegacyFloorConfig(uint256 months, uint256 graceSeconds, uint256 decaySeconds) external;
    function transferMarkeeOwnership(address markee, address newOwner) external;
    function setAdmin(address newAdmin) external;
}

interface IClonableMarkee {
    function initialize(
        address owner,
        address pricingStrategy,
        string calldata initialMessage,
        string calldata name,
        uint256 historicalFunds
    ) external;
}

/// @title StreamingBoardMigrator
/// @notice Forced migration of streaming boards to successors on the same StreamingLeaderboardFactory,
///         whose implementation is by then a BeaconForwarder. Copied Markees are registered through the
///         successor's registerExistingMarkees, so each carried-over total becomes a grandfather floor.
/// @dev Live CFA streams and buffer deposits cannot move. Backers keep withdrawing deposits and closing
///      streams on the legacy board, then reopen on the successor.
/// @dev Floor grace and decay are not readable from a legacy board, so they are fixed per migrator.
contract StreamingBoardMigrator is BoardMigratorBase {
    IStreamingFactoryRegistry public immutable FACTORY;
    uint256 public immutable FLOOR_GRACE_SECONDS;
    uint256 public immutable FLOOR_DECAY_SECONDS;

    mapping(address => address) public seedOf;
    mapping(address => bool) public isSourceImplementation;

    event SourceImplementationSet(address indexed implementation, bool enabled);

    error ZeroFactory();
    error CloneFailed();

    constructor(
        address _owner,
        IStreamingFactoryRegistry _factory,
        uint256 _floorGraceSeconds,
        uint256 _floorDecaySeconds
    ) BoardMigratorBase(_owner) {
        if (address(_factory) == address(0)) revert ZeroFactory();
        FACTORY = _factory;
        FLOOR_GRACE_SECONDS = _floorGraceSeconds;
        FLOOR_DECAY_SECONDS = _floorDecaySeconds;
    }

    /// @notice Approves the implementation legacy boards were cloned from. Boards created after the
    ///         factory moved to the BeaconForwarder are clones of the forwarder, so they never qualify.
    function setSourceImplementation(address _implementation, bool _enabled) external onlyOwner {
        isSourceImplementation[_implementation] = _enabled;
        emit SourceImplementationSet(_implementation, _enabled);
    }

    function _isSourceBoard(address _legacyBoard) internal view override returns (bool) {
        if (!isSourceImplementation[_cloneTarget(_legacyBoard)]) return false;
        address legacyFactory = ILegacyStreamingBoard(_legacyBoard).factory();
        return isSourceFactory[legacyFactory] && IStreamingFactoryRegistry(legacyFactory).isFactoryLeaderboard(_legacyBoard);
    }

    /// @dev The implementation an EIP-1167 clone delegates to, or zero for any other code.
    function _cloneTarget(address _board) internal view returns (address target) {
        if (_board.code.length != 45) return address(0);
        bytes memory code = _board.code;
        if (bytes10(code) != bytes10(0x363d3d373d3d3d363d73)) return address(0);
        assembly {
            target := shr(96, mload(add(code, 0x2a)))
        }
    }

    function _createSuccessor(address _legacyBoard) internal override returns (address successor) {
        ILegacyStreamingBoard legacy = ILegacyStreamingBoard(_legacyBoard);
        (string memory platformName, string memory platformId) =
            IStreamingFactoryRegistry(legacy.factory()).boardPlatform(_legacyBoard);
        address seed;
        (successor, seed) =
            FACTORY.createLeaderboard(legacy.beneficiaryAddress(), legacy.leaderboardName(), platformName, platformId);
        seedOf[successor] = seed;
        ISuccessorStreamingBoard board = ISuccessorStreamingBoard(successor);
        board.setMinimumMonthlyRate(legacy.minimumMonthlyRate());
        board.setLegacyFloorConfig(legacy.legacyFloorMonths(), FLOOR_GRACE_SECONDS, FLOOR_DECAY_SECONDS);
    }

    function _copyMarkee(address _successor, address _legacyMarkee) internal override returns (address copy) {
        copy = _clone(ISuccessorStreamingBoard(_successor).markeeImplementation());
        ILegacyMarkee legacy = ILegacyMarkee(_legacyMarkee);
        IClonableMarkee(copy).initialize(
            legacy.owner(), _successor, legacy.message(), legacy.name(), legacy.totalFundsAdded()
        );
    }

    function _afterCopy(address _successor, address[] memory _copies) internal override {
        if (_copies.length > 0) ISuccessorStreamingBoard(_successor).registerExistingMarkees(_copies);
    }

    function _handOff(address _successor, address _legacyAdmin) internal override {
        ISuccessorStreamingBoard board = ISuccessorStreamingBoard(_successor);
        board.transferMarkeeOwnership(seedOf[_successor], _legacyAdmin);
        board.setAdmin(_legacyAdmin);
    }

    function _clone(address _implementation) internal returns (address instance) {
        assembly {
            mstore(0x00, or(shr(0xe8, shl(0x60, _implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            mstore(0x20, or(shl(0x78, _implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(0, 0x09, 0x37)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
