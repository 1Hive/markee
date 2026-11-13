// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

interface ILegacyMarkee {
    function owner() external view returns (address);
    function message() external view returns (string memory);
    function name() external view returns (string memory);
    function totalFundsAdded() external view returns (uint256);
    function pricingStrategy() external view returns (address);
}

interface ILegacyBoard {
    function admin() external view returns (address);
    function beneficiaryAddress() external view returns (address);
    function leaderboardName() external view returns (string memory);
    function markeeCount() external view returns (uint256);
    function getMarkees(uint256 offset, uint256 limit) external view returns (address[] memory);
    function isMarkeeOnLeaderboard(address markee) external view returns (bool);
}

/// @title BoardMigratorBase
/// @notice Forced migration of a legacy board to a successor board, without the legacy admin's consent.
///         The successor copies the legacy board's configuration and every registered Markee's owner,
///         message, name and totalFundsAdded, and its admin becomes the legacy board's admin.
/// @dev Everything copied is read from the legacy board and its own Markees, so an operator key can run
///      migrations without being able to change what is copied or pick the successor's admin. The
///      Coop multisig (owner) appoints operators and approves which factories boards may be migrated from.
abstract contract BoardMigratorBase {
    enum Status { None, Importing, Finished }

    address public owner;
    address public pendingOwner;
    mapping(address => bool) public isOperator;
    mapping(address => bool) public isSourceFactory;

    mapping(address => address) public successorOf;
    mapping(address => address) public predecessorOf;
    mapping(address => Status) public status;
    mapping(address => address) public markeeSuccessorOf;
    mapping(address => mapping(address => bool)) public isExcluded;

    event OwnerTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event OperatorSet(address indexed operator, bool enabled);
    event SourceFactorySet(address indexed factory, bool enabled);
    event MigrationStarted(address indexed legacyBoard, address indexed successor);
    event MarkeeCopied(
        address indexed legacyBoard, address indexed legacyMarkee, address indexed successorMarkee, uint256 totalFundsAdded
    );
    event BoardMigrated(address indexed legacyBoard, address indexed successor, address indexed admin);
    event MarkeeExcluded(address indexed legacyBoard, address indexed legacyMarkee);

    error OnlyOwner();
    error OnlyPendingOwner();
    error OnlyOperator();
    error ZeroOwner();
    error UnknownSourceBoard();
    error AlreadyStarted();
    error NotImporting();
    error MarkeeNotCopied(address legacyMarkee);

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender] && msg.sender != owner) revert OnlyOperator();
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroOwner();
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    // ─── Migration ────────────────────────────────────────────────────────────

    /// @notice One-shot migration for boards small enough to copy in a single transaction.
    function migrate(address _legacyBoard) external onlyOperator returns (address successor) {
        successor = _start(_legacyBoard);
        _import(_legacyBoard, 0, type(uint256).max);
        _finish(_legacyBoard);
    }

    function startMigration(address _legacyBoard) external onlyOperator returns (address successor) {
        return _start(_legacyBoard);
    }

    /// @notice Copies a page of the legacy registry. Pages may overlap or repeat, already-copied Markees
    ///         are skipped, so re-running after a legacy swap-remove reorders the registry is safe.
    function importMarkees(address _legacyBoard, uint256 _offset, uint256 _limit) external onlyOperator {
        _import(_legacyBoard, _offset, _limit);
    }

    /// @notice Hands the successor to the legacy admin once every legacy Markee is copied, foreign, an
    ///         empty seed, or excluded by the owner.
    function finishMigration(address _legacyBoard) external onlyOperator {
        _finish(_legacyBoard);
    }

    /// @notice Lets a migration finish without a legacy Markee that cannot be read or copied (one that
    ///         reverts or returns unbounded data). Owner only, so an operator cannot drop Markees.
    function excludeMarkee(address _legacyBoard, address _legacyMarkee) external onlyOwner {
        isExcluded[_legacyBoard][_legacyMarkee] = true;
        emit MarkeeExcluded(_legacyBoard, _legacyMarkee);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setOperator(address _operator, bool _enabled) external onlyOwner {
        isOperator[_operator] = _enabled;
        emit OperatorSet(_operator, _enabled);
    }

    function setSourceFactory(address _factory, bool _enabled) external onlyOwner {
        isSourceFactory[_factory] = _enabled;
        emit SourceFactorySet(_factory, _enabled);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroOwner();
        pendingOwner = _newOwner;
        emit OwnerTransferStarted(owner, _newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        emit OwnerChanged(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    function _start(address _legacyBoard) internal returns (address successor) {
        if (status[_legacyBoard] != Status.None) revert AlreadyStarted();
        if (!_isSourceBoard(_legacyBoard)) revert UnknownSourceBoard();
        successor = _createSuccessor(_legacyBoard);
        successorOf[_legacyBoard] = successor;
        predecessorOf[successor] = _legacyBoard;
        status[_legacyBoard] = Status.Importing;
        emit MigrationStarted(_legacyBoard, successor);
    }

    function _import(address _legacyBoard, uint256 _offset, uint256 _limit) internal {
        if (status[_legacyBoard] != Status.Importing) revert NotImporting();
        ILegacyBoard legacy = ILegacyBoard(_legacyBoard);
        uint256 count = legacy.markeeCount();
        if (_offset >= count) return;
        uint256 limit = _limit > count - _offset ? count - _offset : _limit;
        address[] memory page = legacy.getMarkees(_offset, limit);

        address successor = successorOf[_legacyBoard];
        address[] memory pending = new address[](page.length);
        uint256 n;
        for (uint256 i = 0; i < page.length; i++) {
            address m = page[i];
            if (markeeSuccessorOf[m] != address(0) || isExcluded[_legacyBoard][m] || _skippable(_legacyBoard, m)) {
                continue;
            }
            address copy = _copyMarkee(successor, m);
            markeeSuccessorOf[m] = copy;
            pending[n++] = copy;
            emit MarkeeCopied(_legacyBoard, m, copy, ILegacyMarkee(copy).totalFundsAdded());
        }
        assembly {
            mstore(pending, n)
        }
        _afterCopy(successor, pending);
    }

    function _finish(address _legacyBoard) internal {
        if (status[_legacyBoard] != Status.Importing) revert NotImporting();
        ILegacyBoard legacy = ILegacyBoard(_legacyBoard);
        address[] memory all = legacy.getMarkees(0, legacy.markeeCount());
        for (uint256 i = 0; i < all.length; i++) {
            address m = all[i];
            if (markeeSuccessorOf[m] == address(0) && !isExcluded[_legacyBoard][m] && !_skippable(_legacyBoard, m)) {
                revert MarkeeNotCopied(m);
            }
        }
        status[_legacyBoard] = Status.Finished;
        address successor = successorOf[_legacyBoard];
        address legacyAdmin = ILegacyBoard(_legacyBoard).admin();
        _handOff(successor, legacyAdmin);
        emit BoardMigrated(_legacyBoard, successor, legacyAdmin);
    }

    /// @dev Foreign Markees (registered here but owned by another board's strategy) belong to the board
    ///      that controls them, so they are never copied from this one.
    function _skippable(address _legacyBoard, address _markee) internal view returns (bool) {
        ILegacyMarkee m = ILegacyMarkee(_markee);
        if (m.pricingStrategy() != _legacyBoard) return true;
        return m.totalFundsAdded() == 0 && bytes(m.message()).length == 0 && bytes(m.name()).length == 0;
    }

    function _isSourceBoard(address _legacyBoard) internal view virtual returns (bool);

    function _createSuccessor(address _legacyBoard) internal virtual returns (address successor);

    function _copyMarkee(address _successor, address _legacyMarkee) internal virtual returns (address copy);

    function _afterCopy(address _successor, address[] memory _copies) internal virtual;

    function _handOff(address _successor, address _legacyAdmin) internal virtual;
}
