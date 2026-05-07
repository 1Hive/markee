// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Leaderboard.sol";

/// @title LeaderboardFactory
/// @notice Platform-level factory that deploys Leaderboard instances with canonical Markee Cooperative config.
///
/// @dev Key differences from v1.0:
///      - RevNet terminal and project ID are NOT baked into the factory. They default to zero on each
///        new Leaderboard and are set by the leaderboard admin once RevNet v6 is live. This prevents
///        the v5/v6 migration problem where stale terminal addresses were locked at deployment time.
///      - platformFeeReceiver is injected into every Leaderboard at creation. This is the address
///        (controlled by the Markee Cooperative) that receives a share of MARKEE token issuance from
///        the RevNet on every payment. If address(0), 100% of MARKEE goes to buyers.
///
/// @dev Uses EIP-1167 minimal proxy clones for Leaderboard deployments. The factory holds the
///      Leaderboard implementation address; each Leaderboard holds the Markee implementation address
///      and clones it for each new message slot. No full contract bytecode is embedded at any level,
///      keeping all contracts under the 24KB size limit (EIP-170).
///
/// @dev Maintains a registry of all deployed Leaderboards for on-chain discovery.
contract LeaderboardFactory {

    // ─────────────────────────────────────────────
    // Platform config
    // ─────────────────────────────────────────────

    /// @notice Human-readable name for the platform this factory serves (e.g. "GitHub")
    string public platformName;

    /// @notice Short programmatic identifier for the platform (e.g. "github")
    /// @dev Used for frontend routing and agent context. Lowercase, no spaces.
    string public platformId;

    /// @notice The Leaderboard implementation contract that all clones delegate to
    address public immutable leaderboardImplementation;

    /// @notice The Markee implementation contract — passed into each Leaderboard clone,
    ///         which uses it to clone individual Markee message slots
    address public immutable markeeImplementation;

    // ─────────────────────────────────────────────
    // Cooperative fee config
    // ─────────────────────────────────────────────

    /// @notice Address that receives a share of MARKEE token issuance from every RevNet payment
    ///         across all Leaderboards deployed by this factory.
    /// @dev Injected into each new Leaderboard at creation. The leaderboard admin can update it
    ///      after the fact. Set to address(0) to send 100% of MARKEE issuance to buyers.
    address public platformFeeReceiver;

    // ─────────────────────────────────────────────
    // Factory defaults (updateable by factory admin; apply only to new Leaderboards)
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

    /// @notice All Leaderboard contracts deployed through this factory
    address[] public leaderboards;

    /// @notice Returns true if the address was deployed by this factory
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
    event PlatformFeeReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event DefaultMinimumPriceChanged(uint256 oldPrice, uint256 newPrice);
    event DefaultMaxMessageLengthChanged(uint256 oldLength, uint256 newLength);
    event DefaultMaxNameLengthChanged(uint256 oldLength, uint256 newLength);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _platformName Human-readable platform name (e.g. "GitHub")
    /// @param _platformId Short programmatic platform slug (e.g. "github")
    /// @param _leaderboardImplementation Address of the deployed Leaderboard implementation contract
    /// @param _markeeImplementation Address of the deployed Markee implementation contract
    /// @param _platformFeeReceiver Address to receive the Cooperative's MARKEE token share (can be address(0))
    /// @param _factoryAdmin Address with admin rights over factory-level config
    constructor(
        string memory _platformName,
        string memory _platformId,
        address _leaderboardImplementation,
        address _markeeImplementation,
        address _platformFeeReceiver,
        address _factoryAdmin
    ) {
        require(bytes(_platformName).length > 0, "Platform name cannot be empty");
        require(bytes(_platformId).length > 0, "Platform ID cannot be empty");
        require(_leaderboardImplementation != address(0), "Leaderboard implementation cannot be zero address");
        require(_markeeImplementation != address(0), "Markee implementation cannot be zero address");
        require(_factoryAdmin != address(0), "Factory admin cannot be zero address");

        platformName = _platformName;
        platformId = _platformId;
        leaderboardImplementation = _leaderboardImplementation;
        markeeImplementation = _markeeImplementation;
        platformFeeReceiver = _platformFeeReceiver;
        factoryAdmin = _factoryAdmin;
    }

    // ─────────────────────────────────────────────
    // Leaderboard creation
    // ─────────────────────────────────────────────

    /// @notice Deploys a new Leaderboard clone and seeds it with a free Markee owned by the caller
    /// @dev Clones the Leaderboard implementation via EIP-1167, then calls initialize(). The seed
    ///      Markee is created atomically inside initialize(). The leaderboard creator (msg.sender)
    ///      becomes both the leaderboard admin and the seed Markee owner.
    ///      The factory's current platformFeeReceiver is injected — leaderboard admin can update it
    ///      later via setPlatformFeeReceiver() on the deployed Leaderboard if needed.
    /// @param _beneficiaryAddress Address to receive the ETH beneficiary share on this leaderboard
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
            msg.sender,              // admin = leaderboard creator
            _beneficiaryAddress,
            platformFeeReceiver,     // Cooperative's MARKEE token share recipient
            _leaderboardName,
            markeeImplementation,
            defaultMinimumPrice,
            defaultMaxMessageLength,
            defaultMaxNameLength,
            msg.sender               // seed Markee owner = leaderboard creator
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

    /// @notice Returns the total number of Leaderboards deployed through this factory
    function leaderboardCount() external view returns (uint256) {
        return leaderboards.length;
    }

    /// @notice Returns a paginated slice of deployed Leaderboard addresses
    /// @param offset Start index
    /// @param limit Max number of addresses to return
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
    // Factory admin
    // ─────────────────────────────────────────────

    modifier onlyFactoryAdmin() {
        require(msg.sender == factoryAdmin, "Only factory admin");
        _;
    }

    /// @notice Transfers factory admin rights
    function setFactoryAdmin(address _newAdmin) external onlyFactoryAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        address old = factoryAdmin;
        factoryAdmin = _newAdmin;
        emit FactoryAdminChanged(old, _newAdmin);
    }

    /// @notice Updates the platform fee receiver injected into newly created Leaderboards
    /// @dev Does not affect already-deployed Leaderboards — update those individually via
    ///      setPlatformFeeReceiver() on each deployed Leaderboard if needed.
    function setPlatformFeeReceiver(address _newReceiver) external onlyFactoryAdmin {
        address old = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;
        emit PlatformFeeReceiverChanged(old, _newReceiver);
    }

    /// @notice Updates the default minimum price applied to new Leaderboards
    /// @dev Does not affect already-deployed Leaderboards
    function setDefaultMinimumPrice(uint256 _newPrice) external onlyFactoryAdmin {
        uint256 old = defaultMinimumPrice;
        defaultMinimumPrice = _newPrice;
        emit DefaultMinimumPriceChanged(old, _newPrice);
    }

    /// @notice Updates the default max message length applied to new Leaderboards
    /// @dev Does not affect already-deployed Leaderboards
    function setDefaultMaxMessageLength(uint256 _newLength) external onlyFactoryAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = defaultMaxMessageLength;
        defaultMaxMessageLength = _newLength;
        emit DefaultMaxMessageLengthChanged(old, _newLength);
    }

    /// @notice Updates the default max name length applied to new Leaderboards
    /// @dev Does not affect already-deployed Leaderboards
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
