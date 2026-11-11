// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Leaderboard } from "./Leaderboard.sol";
import { ILeaderboardFactory } from "../v1.3/Interfaces.sol";

/// @title LeaderboardFactory v1.4
/// @notice v1.3 factory with injected implementations, so boards can be clones of a BeaconForwarder and
///         therefore upgradeable and pausable by the Coop through the beacon. Boards run the v1.4
///         Leaderboard with v1.3 Markees and read the same six RevNet/fee values from this factory.
/// @dev The migrator (set by the factory admin) can create a board it administers itself while it copies
///      a legacy board's Markees in, with the seed Markee owned by the legacy board's admin.
contract LeaderboardFactory is ILeaderboardFactory {

    // ─── Platform config ──────────────────────────────────────────────────────

    string public platformName;
    string public platformId;

    address public immutable leaderboardImplementation;
    address public immutable markeeImplementation;

    address public migrator;

    // ─── RevNet + fee config — factory admin (Coop multisig) only ────────────
    // All six values are read by every v1.3 Leaderboard at pay-time.
    // Updating any one of them here instantly affects every leaderboard on this factory.

    address public override revNetTerminal;
    uint256 public override revNetProjectId;
    bool public override revNetEnabled;
    uint256 public override percentToBeneficiary;
    address public override platformFeeReceiver;
    uint256 public override percentToPlatformFeeReceiver;

    // ─── Factory defaults for new leaderboards ────────────────────────────────

    uint256 public defaultMinimumPrice;
    uint256 public defaultMaxMessageLength;
    uint256 public defaultMaxNameLength;

    // ─── Factory admin ────────────────────────────────────────────────────────

    address public factoryAdmin;

    // ─── Leaderboard registry ─────────────────────────────────────────────────

    address[] public leaderboards;
    mapping(address => bool) public isFactoryLeaderboard;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LeaderboardCreated(
        address indexed leaderboardAddress,
        address indexed admin,
        address indexed beneficiaryAddress,
        string name,
        address seedMarkeeAddress
    );
    event FactoryAdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event MigratorChanged(address indexed oldMigrator, address indexed newMigrator);
    event RevNetTerminalChanged(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdChanged(uint256 oldId, uint256 newId);
    event RevNetEnabledChanged(bool oldEnabled, bool newEnabled);
    event PercentToBeneficiaryChanged(uint256 oldPercent, uint256 newPercent);
    event PlatformFeeReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event PercentToPlatformFeeReceiverChanged(uint256 oldPercent, uint256 newPercent);
    event DefaultMinimumPriceChanged(uint256 oldPrice, uint256 newPrice);
    event DefaultMaxMessageLengthChanged(uint256 oldLength, uint256 newLength);
    event DefaultMaxNameLengthChanged(uint256 oldLength, uint256 newLength);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyFactoryAdmin() {
        require(msg.sender == factoryAdmin, "Only factory admin");
        _;
    }

    modifier onlyMigrator() {
        require(msg.sender == migrator && migrator != address(0), "Only migrator");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        string memory _platformName,
        string memory _platformId,
        address _leaderboardImplementation,
        address _markeeImplementation,
        address _revNetTerminal,
        uint256 _revNetProjectId,
        address _platformFeeReceiver,
        address _factoryAdmin
    ) {
        require(bytes(_platformName).length > 0, "Platform name cannot be empty");
        require(bytes(_platformId).length > 0, "Platform ID cannot be empty");
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");
        require(_revNetProjectId > 0, "RevNet project ID cannot be zero");
        require(_factoryAdmin != address(0), "Factory admin cannot be zero address");

        require(_leaderboardImplementation.code.length > 0, "Leaderboard implementation not a contract");
        require(_markeeImplementation.code.length > 0, "Markee implementation not a contract");

        leaderboardImplementation = _leaderboardImplementation;
        markeeImplementation = _markeeImplementation;

        platformName = _platformName;
        platformId = _platformId;
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        revNetEnabled = true;
        percentToBeneficiary = 6200;
        platformFeeReceiver = _platformFeeReceiver;
        percentToPlatformFeeReceiver = 3800;
        factoryAdmin = _factoryAdmin;
        defaultMinimumPrice = 0.001 ether;
        defaultMaxMessageLength = 222;
        defaultMaxNameLength = 22;
    }

    // ─── Leaderboard creation ─────────────────────────────────────────────────

    function createLeaderboard(
        address _beneficiaryAddress,
        string calldata _leaderboardName
    )
        external
        returns (address leaderboardAddress, address seedMarkeeAddress)
    {
        return _createLeaderboard(msg.sender, msg.sender, _beneficiaryAddress, _leaderboardName);
    }

    /// @notice Creates a board administered by the migrator, which hands admin to the legacy board's
    ///         admin once every Markee is copied in.
    function createMigrationLeaderboard(
        address _seedOwner,
        address _beneficiaryAddress,
        string calldata _leaderboardName
    )
        external
        onlyMigrator
        returns (address leaderboardAddress, address seedMarkeeAddress)
    {
        return _createLeaderboard(msg.sender, _seedOwner, _beneficiaryAddress, _leaderboardName);
    }

    function _createLeaderboard(
        address _admin,
        address _seedOwner,
        address _beneficiaryAddress,
        string calldata _leaderboardName
    )
        internal
        returns (address leaderboardAddress, address seedMarkeeAddress)
    {
        require(bytes(_leaderboardName).length > 0, "Name cannot be empty");

        leaderboardAddress = _clone(leaderboardImplementation);

        seedMarkeeAddress = Leaderboard(leaderboardAddress).initialize(
            _admin,
            _beneficiaryAddress,
            _leaderboardName,
            markeeImplementation,
            defaultMinimumPrice,
            defaultMaxMessageLength,
            defaultMaxNameLength,
            _seedOwner
        );

        leaderboards.push(leaderboardAddress);
        isFactoryLeaderboard[leaderboardAddress] = true;

        emit LeaderboardCreated(
            leaderboardAddress,
            _admin,
            _beneficiaryAddress,
            _leaderboardName,
            seedMarkeeAddress
        );
    }

    // ─── Registry queries ─────────────────────────────────────────────────────

    function leaderboardCount() external view returns (uint256) {
        return leaderboards.length;
    }

    function getLeaderboards(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory result)
    {
        uint256 end = offset + limit;
        if (end > leaderboards.length) end = leaderboards.length;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = leaderboards[i];
        }
    }

    // ─── Factory admin setters ────────────────────────────────────────────────

    /// @notice Enables or disables RevNet routing across ALL leaderboards on this factory.
    /// @dev Set to false immediately if a RevNet vulnerability is discovered. Takes effect
    ///      for every leaderboard's next payment without any per-leaderboard transactions.
    function setRevNetEnabled(bool _enabled) external onlyFactoryAdmin {
        bool old = revNetEnabled;
        revNetEnabled = _enabled;
        emit RevNetEnabledChanged(old, _enabled);
    }

    /// @notice Updates the beneficiary share (basis points, 10000 = 100%) across ALL leaderboards.
    function setPercentToBeneficiary(uint256 _newPercent) external onlyFactoryAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToBeneficiary;
        percentToBeneficiary = _newPercent;
        emit PercentToBeneficiaryChanged(old, _newPercent);
    }

    /// @notice Updates the JB terminal for RevNet payments across ALL leaderboards.
    function setRevNetTerminal(address _newTerminal) external onlyFactoryAdmin {
        require(_newTerminal != address(0), "Terminal cannot be zero address");
        address old = revNetTerminal;
        revNetTerminal = _newTerminal;
        emit RevNetTerminalChanged(old, _newTerminal);
    }

    /// @notice Updates the RevNet project ID across ALL leaderboards.
    function setRevNetProjectId(uint256 _newProjectId) external onlyFactoryAdmin {
        require(_newProjectId > 0, "Project ID cannot be zero");
        uint256 old = revNetProjectId;
        revNetProjectId = _newProjectId;
        emit RevNetProjectIdChanged(old, _newProjectId);
    }

    /// @notice Updates the address that receives the Coop's MARKEE token share.
    function setPlatformFeeReceiver(address _newReceiver) external onlyFactoryAdmin {
        address old = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;
        emit PlatformFeeReceiverChanged(old, _newReceiver);
    }

    /// @notice Updates the Coop's share of the RevNet portion (basis points) across ALL leaderboards.
    function setPercentToPlatformFeeReceiver(uint256 _newPercent) external onlyFactoryAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToPlatformFeeReceiver;
        percentToPlatformFeeReceiver = _newPercent;
        emit PercentToPlatformFeeReceiverChanged(old, _newPercent);
    }

    function setFactoryAdmin(address _newAdmin) external onlyFactoryAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        address old = factoryAdmin;
        factoryAdmin = _newAdmin;
        emit FactoryAdminChanged(old, _newAdmin);
    }

    function setMigrator(address _newMigrator) external onlyFactoryAdmin {
        address old = migrator;
        migrator = _newMigrator;
        emit MigratorChanged(old, _newMigrator);
    }

    function setDefaultMinimumPrice(uint256 _newPrice) external onlyFactoryAdmin {
        uint256 old = defaultMinimumPrice;
        defaultMinimumPrice = _newPrice;
        emit DefaultMinimumPriceChanged(old, _newPrice);
    }

    function setDefaultMaxMessageLength(uint256 _newLength) external onlyFactoryAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = defaultMaxMessageLength;
        defaultMaxMessageLength = _newLength;
        emit DefaultMaxMessageLengthChanged(old, _newLength);
    }

    function setDefaultMaxNameLength(uint256 _newLength) external onlyFactoryAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = defaultMaxNameLength;
        defaultMaxNameLength = _newLength;
        emit DefaultMaxNameLengthChanged(old, _newLength);
    }

    // ─── EIP-1167 minimal proxy ───────────────────────────────────────────────

    function _clone(address implementation) internal returns (address instance) {
        assembly {
            mstore(0x00, or(
                shr(0xe8, shl(0x60, implementation)),
                0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000
            ))
            mstore(0x20, or(
                shl(0x78, implementation),
                0x5af43d82803e903d91602b57fd5bf3
            ))
            instance := create(0, 0x09, 0x37)
        }
        require(instance != address(0), "Clone deployment failed");
    }
}
