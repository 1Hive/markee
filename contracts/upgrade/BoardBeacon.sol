// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @title BoardBeacon
/// @notice Single source of board logic for every board cloned from a BeaconForwarder. The Coop
///         multisig (admin) upgrades all of them at once behind a fixed delay, and the admin or a
///         guardian can pause money-in entry points instantly, globally or per board.
/// @dev Boards are EIP-1167 clones of a BeaconForwarder, so each call runs clone → forwarder →
///      implementation, all in the board's storage. Implementations must keep storage append-only.
/// @dev Only selectors marked pausable can be blocked. Exits are left unpausable by never marking them,
///      and a family-specific subclass can refuse to mark them at all (see _assertPausable).
abstract contract BoardBeacon {
    uint256 public constant MIN_UPGRADE_DELAY = 1 days;

    uint256 public immutable UPGRADE_DELAY;

    address public implementation;
    address public pendingImplementation;
    uint256 public upgradeReadyAt;

    address public admin;
    address public pendingAdmin;
    address public guardian;
    address public pendingGuardian;
    uint256 public guardianReadyAt;

    bool public pausedAll;
    mapping(address => bool) public boardPaused;
    mapping(bytes4 => bool) public isPausable;

    event UpgradeScheduled(address indexed implementation, uint256 readyAt);
    event UpgradeCancelled(address indexed implementation);
    event Upgraded(address indexed oldImplementation, address indexed newImplementation);
    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event GuardianChanged(address indexed oldGuardian, address indexed newGuardian);
    event GuardianChangeScheduled(address indexed guardian, uint256 readyAt);
    event GuardianChangeCancelled(address indexed guardian);
    event PausedAll(address indexed by);
    event UnpausedAll(address indexed by);
    event BoardPaused(address indexed board, address indexed by);
    event BoardUnpaused(address indexed board, address indexed by);
    event PausableSet(bytes4 indexed selector, bool pausable);

    error OnlyAdmin();
    error OnlyPendingAdmin();
    error OnlyAdminOrGuardian();
    error ZeroAdmin();
    error DelayTooShort();
    error ImplementationNotContract();
    error ImplementationIsForwarder();
    error OnlyGuardian();
    error NoPendingGuardian();
    error GuardianChangeNotReady();
    error NoPendingUpgrade();
    error UpgradeNotReady();
    error Paused(address board, bytes4 selector);
    error SelectorNotPausable(bytes4 selector);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyAdminOrGuardian() {
        if (msg.sender != admin && msg.sender != guardian) revert OnlyAdminOrGuardian();
        _;
    }

    constructor(address _admin, address _guardian, uint256 _upgradeDelay) {
        if (_admin == address(0)) revert ZeroAdmin();
        if (_upgradeDelay < MIN_UPGRADE_DELAY) revert DelayTooShort();
        UPGRADE_DELAY = _upgradeDelay;
        admin = _admin;
        guardian = _guardian;
        emit AdminChanged(address(0), _admin);
        emit GuardianChanged(address(0), _guardian);
    }

    /// @dev Called from each subclass constructor body, after the subclass has set the immutables its
    ///      validation reads.
    function _install(address _implementation, bytes4[] memory _pausableSelectors) internal {
        _validateImplementation(_implementation);
        implementation = _implementation;
        emit Upgraded(address(0), _implementation);
        for (uint256 i = 0; i < _pausableSelectors.length; i++) {
            _setPausable(_pausableSelectors[i], true);
        }
    }

    // ─── Routing (called by every board's forwarder on every call) ─────────────

    /// @notice The implementation a board must delegate `selector` to, reverting when the calling board
    ///         is paused and `selector` is pausable. msg.sender is the board, since the forwarder code
    ///         runs in the board's context.
    function route(bytes4 selector) external view returns (address) {
        if (isPausable[selector] && (pausedAll || boardPaused[msg.sender])) revert Paused(msg.sender, selector);
        return implementation;
    }

    function isPaused(address board) external view returns (bool) {
        return pausedAll || boardPaused[board];
    }

    // ─── Timelocked upgrades ──────────────────────────────────────────────────

    /// @notice Replaces any pending upgrade, emitting UpgradeCancelled for it and restarting the delay.
    function scheduleUpgrade(address _newImplementation) external onlyAdmin {
        _validateImplementation(_newImplementation);
        address replaced = pendingImplementation;
        if (replaced != address(0)) emit UpgradeCancelled(replaced);
        pendingImplementation = _newImplementation;
        upgradeReadyAt = block.timestamp + UPGRADE_DELAY;
        emit UpgradeScheduled(_newImplementation, upgradeReadyAt);
    }

    /// @notice The guardian can cancel too, and replacing the guardian waits out the same delay, so a
    ///         compromised admin key cannot push malicious logic through unopposed.
    function cancelUpgrade() external onlyAdminOrGuardian {
        address pending = pendingImplementation;
        if (pending == address(0)) revert NoPendingUpgrade();
        pendingImplementation = address(0);
        upgradeReadyAt = 0;
        emit UpgradeCancelled(pending);
    }

    function executeUpgrade() external {
        address pending = pendingImplementation;
        if (pending == address(0)) revert NoPendingUpgrade();
        if (block.timestamp < upgradeReadyAt) revert UpgradeNotReady();
        address old = implementation;
        implementation = pending;
        pendingImplementation = address(0);
        upgradeReadyAt = 0;
        emit Upgraded(old, pending);
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function pauseAll() external onlyAdminOrGuardian {
        pausedAll = true;
        emit PausedAll(msg.sender);
    }

    function unpauseAll() external onlyAdmin {
        pausedAll = false;
        emit UnpausedAll(msg.sender);
    }

    function pauseBoard(address _board) external onlyAdminOrGuardian {
        boardPaused[_board] = true;
        emit BoardPaused(_board, msg.sender);
    }

    function unpauseBoard(address _board) external onlyAdmin {
        boardPaused[_board] = false;
        emit BoardUnpaused(_board, msg.sender);
    }

    function setPausable(bytes4[] calldata _selectors, bool _pausable) external onlyAdmin {
        for (uint256 i = 0; i < _selectors.length; i++) {
            _setPausable(_selectors[i], _pausable);
        }
    }

    // ─── Roles ────────────────────────────────────────────────────────────────

    /// @notice Replaces any pending guardian change, emitting GuardianChangeCancelled for it and
    ///         restarting the delay.
    function scheduleGuardianChange(address _newGuardian) external onlyAdmin {
        if (guardianReadyAt != 0) emit GuardianChangeCancelled(pendingGuardian);
        pendingGuardian = _newGuardian;
        guardianReadyAt = block.timestamp + UPGRADE_DELAY;
        emit GuardianChangeScheduled(_newGuardian, guardianReadyAt);
    }

    function cancelGuardianChange() external onlyAdminOrGuardian {
        if (guardianReadyAt == 0) revert NoPendingGuardian();
        emit GuardianChangeCancelled(pendingGuardian);
        pendingGuardian = address(0);
        guardianReadyAt = 0;
    }

    function executeGuardianChange() external {
        if (guardianReadyAt == 0) revert NoPendingGuardian();
        if (block.timestamp < guardianReadyAt) revert GuardianChangeNotReady();
        emit GuardianChanged(guardian, pendingGuardian);
        guardian = pendingGuardian;
        pendingGuardian = address(0);
        guardianReadyAt = 0;
    }

    function resignGuardian() external {
        if (msg.sender != guardian) revert OnlyGuardian();
        emit GuardianChanged(msg.sender, address(0));
        guardian = address(0);
    }

    function transferAdmin(address _newAdmin) external onlyAdmin {
        if (_newAdmin == address(0)) revert ZeroAdmin();
        pendingAdmin = _newAdmin;
        emit AdminTransferStarted(admin, _newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert OnlyPendingAdmin();
        emit AdminChanged(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    // ─── Hooks ────────────────────────────────────────────────────────────────

    function _setPausable(bytes4 _selector, bool _pausable) internal {
        if (_pausable) _assertPausable(_selector);
        isPausable[_selector] = _pausable;
        emit PausableSet(_selector, _pausable);
    }

    /// @dev A forwarder (or this beacon) as the implementation would make every board delegate into
    ///      itself until it runs out of gas, which also jails every streaming board on its next close.
    ///      A forwarder is recognised by boardBeacon() returning exactly one ABI word holding the address
    ///      of a contract, so a fallback that merely does not revert is not mistaken for one. Forwarders of
    ///      any beacon are rejected, not only this one's, since two beacons each routing to the other's
    ///      forwarder would loop the same way.
    function _validateImplementation(address _implementation) internal view virtual {
        if (_implementation.code.length == 0) revert ImplementationNotContract();
        if (_implementation == address(this)) revert ImplementationIsForwarder();
        (bool ok, bytes memory data) = _implementation.staticcall(abi.encodeWithSignature("boardBeacon()"));
        if (!ok || data.length != 32) return;
        uint256 word = abi.decode(data, (uint256));
        if (word >> 160 == 0 && address(uint160(word)).code.length != 0) revert ImplementationIsForwarder();
    }

    function _assertPausable(bytes4 _selector) internal view virtual {}
}
