// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Leaderboard.sol";
import "./Markee.sol";
import "./Interfaces.sol";

/// @title LeaderboardFactory v1.3
/// @notice Platform-level factory that deploys v1.3 Leaderboard instances.
///
/// @dev Changes from v1.2:
///      - Constructor deploys both Leaderboard and Markee implementation contracts directly.
///        No pre-deployment of implementations needed — deploying the factory is the only step.
///      - revNetEnabled, percentToBeneficiary, platformFeeReceiver, and
///        percentToPlatformFeeReceiver are now stored here alongside revNetTerminal and
///        revNetProjectId. Every v1.3 Leaderboard reads all six values from this factory at
///        pay-time via ILeaderboardFactory — none are stored per-leaderboard.
///      - All six values are onlyFactoryAdmin (Markee Cooperative multisig). Individual
///        leaderboard admins have no ability to change RevNet routing or fee splits.
///      - setRevNetEnabled() allows the Coop to instantly disable RevNet across all leaderboards
///        on this factory in case of a vulnerability or terminal upgrade.
///
/// @dev Implements ILeaderboardFactory so deployed Leaderboard clones can call
///      factory.revNetEnabled(), factory.percentToBeneficiary(), etc. at pay-time.
contract LeaderboardFactory is ILeaderboardFactory {

    // ─── Platform config ──────────────────────────────────────────────────────

    string public platformName;
    string public platformId;

    /// @notice The Leaderboard implementation contract cloned for each new leaderboard.
    /// @dev Deployed in the constructor via `new Leaderboard()`.
    address public immutable leaderboardImplementation;

    /// @notice The Markee implementation contract cloned for each new Markee.
    /// @dev Deployed in the constructor via `new Markee()`.
    address public immutable markeeImplementation;

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

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploys the factory and both implementation contracts in a single transaction.
    /// @param _platformName  Human-readable platform name (e.g. "Open Internet", "GitHub", "Superfluid")
    /// @param _platformId    Short programmatic slug (e.g. "openinternet", "github", "superfluid")
    /// @param _revNetTerminal    JB Multi-Terminal address: 0x2dB6d704058E552DeFE415753465df8dF0361846
    /// @param _revNetProjectId  Markee Cooperative RevNet project ID: 152
    /// @param _platformFeeReceiver  Address that receives the Coop's MARKEE token share (can be address(0))
    /// @param _factoryAdmin  Markee Cooperative multisig — same address across all three factories
    constructor(
        string memory _platformName,
        string memory _platformId,
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

        leaderboardImplementation = address(new Leaderboard());
        markeeImplementation = address(new Markee());

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

    /// @notice Deploys a new v1.3 Leaderboard clone.
    /// @dev The new leaderboard reads all RevNet and fee config from this factory at pay-time.
    ///      revNetEnabled defaults to true and percentToBeneficiary to 6200 — no setup needed.
    /// @param _beneficiaryAddress  Address to receive the ETH beneficiary share (creator's treasury)
    /// @param _leaderboardName     Human-readable name for this leaderboard
    /// @return leaderboardAddress  The deployed Leaderboard clone
    /// @return seedMarkeeAddress   The deployed seed Markee (owned by msg.sender)
    function createLeaderboard(
        address _beneficiaryAddress,
        string calldata _leaderboardName
    )
        external
        returns (address leaderboardAddress, address seedMarkeeAddress)
    {
        require(bytes(_leaderboardName).length > 0, "Name cannot be empty");

        leaderboardAddress = _clone(leaderboardImplementation);

        seedMarkeeAddress = Leaderboard(leaderboardAddress).initialize(
            msg.sender,
            _beneficiaryAddress,
            _leaderboardName,
            markeeImplementation,
            defaultMinimumPrice,
            defaultMaxMessageLength,
            defaultMaxNameLength,
            msg.sender
        );

        leaderboards.push(leaderboardAddress);
        isFactoryLeaderboard[leaderboardAddress] = true;

        emit LeaderboardCreated(
            leaderboardAddress,
            msg.sender,
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
