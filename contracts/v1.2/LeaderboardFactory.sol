// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Leaderboard.sol";

/// @title LeaderboardFactory v1.2
/// @notice Platform-level factory that deploys v1.2 Leaderboard instances.
///
/// @dev Changes from v1.1:
///      - Stores revNetTerminal and revNetProjectId at the factory level.
///        Every v1.2 Leaderboard reads these values from this factory at pay-time via
///        ILeaderboardFactory, so the Markee Cooperative controls RevNet routing for all
///        leaderboards from one place with a single transaction.
///      - setRevNetTerminal() and setRevNetProjectId() are onlyFactoryAdmin — only the
///        Markee Cooperative multisig can call them. Individual leaderboard admins have
///        no way to redirect RevNet funds to an arbitrary project.
///      - New leaderboards default to revNetEnabled = true and percentToBeneficiary = 6200.
///        No post-creation setup is required from leaderboard creators.
///
/// @dev Implements ILeaderboardFactory so deployed Leaderboard clones can call
///      factory.revNetTerminal() and factory.revNetProjectId() at pay-time.
contract LeaderboardFactory {

    // ─────────────────────────────────────────────
    // Platform config
    // ─────────────────────────────────────────────

    string public platformName;
    string public platformId;
    address public immutable leaderboardImplementation;
    address public immutable markeeImplementation;

    // ─────────────────────────────────────────────
    // RevNet config — controlled exclusively by factoryAdmin (Markee Cooperative)
    // ─────────────────────────────────────────────

    /// @notice Juicebox Multi-Terminal address for RevNet payments.
    /// @dev All v1.2 Leaderboards read this at pay-time. Changing it here instantly updates
    ///      every leaderboard across this factory — no per-leaderboard transactions needed.
    address public revNetTerminal;

    /// @notice Markee Cooperative RevNet project ID.
    /// @dev Same propagation guarantee as revNetTerminal.
    uint256 public revNetProjectId;

    // ─────────────────────────────────────────────
    // Cooperative fee config
    // ─────────────────────────────────────────────

    address public platformFeeReceiver;

    // ─────────────────────────────────────────────
    // Factory defaults
    // ─────────────────────────────────────────────

    uint256 public defaultMinimumPrice = 0.001 ether;
    uint256 public defaultMaxMessageLength = 222;
    uint256 public defaultMaxNameLength = 22;

    // ─────────────────────────────────────────────
    // Factory admin
    // ─────────────────────────────────────────────

    address public factoryAdmin;

    // ─────────────────────────────────────────────
    // Leaderboard registry
    // ─────────────────────────────────────────────

    address[] public leaderboards;
    mapping(address => bool) public isFactoryLeaderboard;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event LeaderboardCreated(
        address indexed leaderboardAddress,
        address indexed admin,
        address indexed beneficiaryAddress,
        address platformFeeReceiver,
        string name,
        address seedMarkeeAddress
    );
    event FactoryAdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event RevNetTerminalChanged(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdChanged(uint256 oldId, uint256 newId);
    event PlatformFeeReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event DefaultMinimumPriceChanged(uint256 oldPrice, uint256 newPrice);
    event DefaultMaxMessageLengthChanged(uint256 oldLength, uint256 newLength);
    event DefaultMaxNameLengthChanged(uint256 oldLength, uint256 newLength);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _platformName Human-readable platform name (e.g. "GitHub")
    /// @param _platformId Short programmatic platform slug (e.g. "github")
    /// @param _leaderboardImplementation Address of the deployed v1.2 Leaderboard implementation
    /// @param _markeeImplementation Address of the deployed Markee implementation
    /// @param _revNetTerminal Juicebox Multi-Terminal address for RevNet payments
    /// @param _revNetProjectId Markee Cooperative RevNet project ID
    /// @param _platformFeeReceiver Address to receive the Cooperative's MARKEE token share (can be address(0))
    /// @param _factoryAdmin Address with admin rights over factory-level config (Coop multisig)
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
        require(_leaderboardImplementation != address(0), "Leaderboard implementation cannot be zero address");
        require(_markeeImplementation != address(0), "Markee implementation cannot be zero address");
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");
        require(_revNetProjectId > 0, "RevNet project ID cannot be zero");
        require(_factoryAdmin != address(0), "Factory admin cannot be zero address");

        platformName = _platformName;
        platformId = _platformId;
        leaderboardImplementation = _leaderboardImplementation;
        markeeImplementation = _markeeImplementation;
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        platformFeeReceiver = _platformFeeReceiver;
        factoryAdmin = _factoryAdmin;
    }

    // ─────────────────────────────────────────────
    // Leaderboard creation
    // ─────────────────────────────────────────────

    /// @notice Deploys a new v1.2 Leaderboard clone.
    /// @dev The new leaderboard reads revNetTerminal and revNetProjectId from this factory.
    ///      revNetEnabled defaults to true and percentToBeneficiary to 6200 — no setup needed.
    /// @param _beneficiaryAddress Address to receive the ETH beneficiary share (leaderboard creator's treasury)
    /// @param _leaderboardName Human-readable name for this leaderboard
    /// @return leaderboardAddress The deployed Leaderboard clone address
    /// @return seedMarkeeAddress The deployed seed Markee address
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
            platformFeeReceiver,
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
            platformFeeReceiver,
            _leaderboardName,
            seedMarkeeAddress
        );
    }

    // ─────────────────────────────────────────────
    // Registry queries
    // ─────────────────────────────────────────────

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

    // ─────────────────────────────────────────────
    // Factory admin — RevNet config (Coop only)
    // ─────────────────────────────────────────────

    modifier onlyFactoryAdmin() {
        require(msg.sender == factoryAdmin, "Only factory admin");
        _;
    }

    /// @notice Updates the JB terminal for RevNet payments across ALL v1.2 leaderboards on this factory.
    /// @dev Takes effect immediately for every leaderboard — no per-leaderboard transactions needed.
    function setRevNetTerminal(address _newTerminal) external onlyFactoryAdmin {
        require(_newTerminal != address(0), "Terminal cannot be zero address");
        address old = revNetTerminal;
        revNetTerminal = _newTerminal;
        emit RevNetTerminalChanged(old, _newTerminal);
    }

    /// @notice Updates the RevNet project ID across ALL v1.2 leaderboards on this factory.
    /// @dev Takes effect immediately for every leaderboard — no per-leaderboard transactions needed.
    function setRevNetProjectId(uint256 _newProjectId) external onlyFactoryAdmin {
        require(_newProjectId > 0, "Project ID cannot be zero");
        uint256 old = revNetProjectId;
        revNetProjectId = _newProjectId;
        emit RevNetProjectIdChanged(old, _newProjectId);
    }

    function setFactoryAdmin(address _newAdmin) external onlyFactoryAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        address old = factoryAdmin;
        factoryAdmin = _newAdmin;
        emit FactoryAdminChanged(old, _newAdmin);
    }

    function setPlatformFeeReceiver(address _newReceiver) external onlyFactoryAdmin {
        address old = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;
        emit PlatformFeeReceiverChanged(old, _newReceiver);
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

    // ─────────────────────────────────────────────
    // EIP-1167 minimal proxy
    // ─────────────────────────────────────────────

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
