// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title Leaderboard v1.2
/// @notice A pricing strategy contract that manages a ranked collection of Markee message boards.
///
/// @dev Changes from v1.1:
///      - revNetTerminal and revNetProjectId are NO LONGER stored per-leaderboard.
///        They are read from the factory at pay-time via ILeaderboardFactory. Only the
///        factory admin (Markee Cooperative multisig) can update them, and a single factory
///        update applies to every v1.2 leaderboard simultaneously.
///      - revNetEnabled defaults to true (was false). New leaderboards need no post-creation setup.
///      - percentToBeneficiary defaults to 6200 (was 10000). New leaderboards use 62/38 split.
///      - setRevNetTerminal() and setRevNetProjectId() are removed from the Leaderboard.
///        The leaderboard admin retains control over beneficiaryAddress, percentToBeneficiary,
///        revNetEnabled, platformFeeReceiver, and leaderboard params (min price, message length, etc).
///
/// @dev Deployed as a minimal proxy clone by LeaderboardFactory (EIP-1167).
///      Do not deploy this contract directly.
contract Leaderboard is IPricingStrategy {

    // ─────────────────────────────────────────────
    // Version
    // ─────────────────────────────────────────────

    string public constant VERSION = "1.2.0";

    // ─────────────────────────────────────────────
    // Initialized-once config (set by initialize(), never changes after)
    // ─────────────────────────────────────────────

    address public markeeImplementation;

    /// @notice The factory that deployed this Leaderboard.
    /// @dev Used to read revNetTerminal and revNetProjectId at pay-time.
    address public factory;

    bool public initialized;

    // ─────────────────────────────────────────────
    // Admin-mutable config (implements IPricingStrategy)
    // ─────────────────────────────────────────────

    address public admin;
    address public override beneficiaryAddress;

    /// @notice Beneficiary share in basis points. Default 6200 (62%) — RevNet is live.
    uint256 public override percentToBeneficiary = 6200;

    /// @notice Defaults to true — new leaderboards route to RevNet immediately with no setup.
    bool public override revNetEnabled = true;

    /// @notice Returns the JB terminal from the factory. Only the factory admin (Coop) can change it.
    function revNetTerminal() external view override returns (address) {
        return ILeaderboardFactory(factory).revNetTerminal();
    }

    /// @notice Returns the RevNet project ID from the factory. Only the factory admin (Coop) can change it.
    function revNetProjectId() external view override returns (uint256) {
        return ILeaderboardFactory(factory).revNetProjectId();
    }

    address public override platformFeeReceiver;
    uint256 public override percentToPlatformFeeReceiver = 3800;

    bool public historyInitialized;
    uint256 public minimumPrice;
    uint256 public maxMessageLength;
    uint256 public maxNameLength;
    string public leaderboardName;

    // ─────────────────────────────────────────────
    // Markee registry
    // ─────────────────────────────────────────────

    address[] public markees;
    mapping(address => uint256) private markeeIndex;
    mapping(address => bool) public isMarkeeOnLeaderboard;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name, uint256 amount);
    event FreeMarkeeCreated(address indexed markeeAddress, address indexed owner);
    event MarkeeMigratedFromLegacy(address indexed newMarkeeAddress, address indexed oldMarkeeAddress, address indexed owner, uint256 historicalFunds);
    event FundsAdded(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 newMarkeeTotal);
    event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage);
    event NameUpdated(address indexed markeeAddress, address indexed updatedBy, string newName);
    event MarkeeLeft(address indexed markeeAddress);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event PercentToBeneficiaryChanged(uint256 oldPercent, uint256 newPercent);
    event RevNetEnabledChanged(bool enabled);
    event PlatformFeeReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event PercentToPlatformFeeReceiverChanged(uint256 oldPercent, uint256 newPercent);
    event HistoryInitialized(uint256 markeeCount);
    event MinimumPriceChanged(uint256 oldPrice, uint256 newPrice);
    event MaxMessageLengthChanged(uint256 oldLength, uint256 newLength);
    event MaxNameLengthChanged(uint256 oldLength, uint256 newLength);

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // ─────────────────────────────────────────────
    // Initializer
    // ─────────────────────────────────────────────

    /// @notice Initialises a cloned Leaderboard. Called once by LeaderboardFactory.
    /// @dev revNetTerminal and revNetProjectId are NOT parameters — they are read from the factory
    ///      at pay-time. revNetEnabled defaults to true and percentToBeneficiary to 6200,
    ///      so no post-creation setup is needed.
    function initialize(
        address _admin,
        address _beneficiaryAddress,
        address _platformFeeReceiver,
        string calldata _leaderboardName,
        address _markeeImplementation,
        uint256 _minimumPrice,
        uint256 _maxMessageLength,
        uint256 _maxNameLength,
        address _seedOwner
    ) external returns (address seedMarkeeAddress) {
        require(!initialized, "Already initialized");
        require(_admin != address(0), "Admin cannot be zero address");
        require(_markeeImplementation != address(0), "Markee implementation cannot be zero address");
        require(bytes(_leaderboardName).length > 0, "Name cannot be empty");
        require(_maxMessageLength > 0, "Max message length must be > 0");
        require(_maxNameLength > 0, "Max name length must be > 0");
        require(_seedOwner != address(0), "Seed owner cannot be zero address");

        initialized = true;
        factory = msg.sender;
        admin = _admin;
        beneficiaryAddress = _beneficiaryAddress;
        platformFeeReceiver = _platformFeeReceiver;
        leaderboardName = _leaderboardName;
        markeeImplementation = _markeeImplementation;
        minimumPrice = _minimumPrice;
        maxMessageLength = _maxMessageLength;
        maxNameLength = _maxNameLength;

        // revNetEnabled = true and percentToBeneficiary = 6200 are the storage defaults.
        // revNetTerminal and revNetProjectId are read from factory — no init needed.

        seedMarkeeAddress = _deployFreeMarkee(_seedOwner);
    }

    // ─────────────────────────────────────────────
    // Markee creation
    // ─────────────────────────────────────────────

    function createMarkee(string calldata _message, string calldata _name)
        external
        payable
        returns (address markeeAddress)
    {
        require(initialized, "Not initialized");
        require(msg.value >= minimumPrice, "Below minimum price");
        require(bytes(_message).length <= maxMessageLength, "Message too long");
        require(bytes(_name).length <= maxNameLength, "Name too long");

        markeeAddress = _clone(markeeImplementation);
        Markee(markeeAddress).initialize(msg.sender, address(this), _message, _name, 0);
        _addToRegistry(markeeAddress);
        Markee(markeeAddress).pay{value: msg.value}(msg.sender);
        emit MarkeeCreated(markeeAddress, msg.sender, _message, _name, msg.value);
    }

    function createFreeMarkee(address _owner) external onlyAdmin returns (address markeeAddress) {
        markeeAddress = _deployFreeMarkee(_owner);
    }

    // ─────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────

    function addFunds(address _markeeAddress) external payable {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(msg.value > 0, "Must send ETH");
        Markee markee = Markee(_markeeAddress);
        markee.pay{value: msg.value}(msg.sender);
        emit FundsAdded(_markeeAddress, msg.sender, msg.value, markee.totalFundsAdded());
    }

    // ─────────────────────────────────────────────
    // Free edits
    // ─────────────────────────────────────────────

    function updateMessage(address _markeeAddress, string calldata _newMessage) external {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        Markee markee = Markee(_markeeAddress);
        require(msg.sender == markee.owner(), "Only Markee owner");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        markee.setMessage(_newMessage);
        emit MessageUpdated(_markeeAddress, msg.sender, _newMessage);
    }

    function updateName(address _markeeAddress, string calldata _newName) external {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        Markee markee = Markee(_markeeAddress);
        require(msg.sender == markee.owner(), "Only Markee owner");
        require(bytes(_newName).length <= maxNameLength, "Name too long");
        markee.setName(_newName);
        emit NameUpdated(_markeeAddress, msg.sender, _newName);
    }

    // ─────────────────────────────────────────────
    // Migration
    // ─────────────────────────────────────────────

    function migratePricingStrategy(address _markeeAddress, address _newStrategy) external onlyAdmin {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        _removeFromRegistry(_markeeAddress);
        Markee(_markeeAddress).setPricingStrategy(_newStrategy);
    }

    function markeeLeft(address _markeeAddress) external {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(
            Markee(_markeeAddress).pricingStrategy() != address(this),
            "Markee still on this leaderboard"
        );
        _removeFromRegistry(_markeeAddress);
        emit MarkeeLeft(_markeeAddress);
    }

    /// @notice Migrates a legacy Markee (v1.0 or v1.1) to this v1.2 leaderboard.
    /// @dev Reads owner, message, name, and totalFundsAdded from the old clone on-chain.
    ///      Historical funds cannot be inflated — they come directly from the old clone's state.
    function migrateFromLegacy(address _oldMarkee) external onlyAdmin returns (address newMarkeeAddress) {
        require(_oldMarkee != address(0), "Old markee cannot be zero address");
        require(!isMarkeeOnLeaderboard[_oldMarkee], "Already on this leaderboard");

        Markee old = Markee(_oldMarkee);
        newMarkeeAddress = _clone(markeeImplementation);
        Markee(newMarkeeAddress).initialize(
            old.owner(),
            address(this),
            old.message(),
            old.name(),
            old.totalFundsAdded()
        );
        _addToRegistry(newMarkeeAddress);
        emit MarkeeMigratedFromLegacy(newMarkeeAddress, _oldMarkee, old.owner(), old.totalFundsAdded());
    }

    // ─────────────────────────────────────────────
    // Leaderboard queries
    // ─────────────────────────────────────────────

    function markeeCount() external view returns (uint256) {
        return markees.length;
    }

    function totalLeaderboardFunds() external view returns (uint256 total) {
        for (uint256 i = 0; i < markees.length; i++) {
            total += Markee(markees[i]).totalFundsAdded();
        }
    }

    function getMarkees(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 end = offset + limit;
        if (end > markees.length) end = markees.length;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = markees[i];
        }
    }

    function getTopMarkees(uint256 limit)
        external
        view
        returns (address[] memory topAddresses, uint256[] memory topFunds)
    {
        uint256 total = markees.length;
        if (limit > total) limit = total;

        address[] memory addrs = new address[](total);
        uint256[] memory funds = new uint256[](total);
        for (uint256 i = 0; i < total; i++) {
            addrs[i] = markees[i];
            funds[i] = Markee(markees[i]).totalFundsAdded();
        }
        for (uint256 i = 1; i < total; i++) {
            address addrKey = addrs[i];
            uint256 fundKey = funds[i];
            uint256 j = i;
            while (j > 0 && funds[j - 1] < fundKey) {
                funds[j] = funds[j - 1];
                addrs[j] = addrs[j - 1];
                j--;
            }
            funds[j] = fundKey;
            addrs[j] = addrKey;
        }

        topAddresses = new address[](limit);
        topFunds = new uint256[](limit);
        for (uint256 i = 0; i < limit; i++) {
            topAddresses[i] = addrs[i];
            topFunds[i] = funds[i];
        }
    }

    // ─────────────────────────────────────────────
    // History seeding
    // ─────────────────────────────────────────────

    function initializeHistory(address[] calldata _markees) external onlyAdmin {
        require(!historyInitialized, "History already initialized");
        historyInitialized = true;
        for (uint256 i = 0; i < _markees.length; i++) {
            address m = _markees[i];
            if (m != address(0) && !isMarkeeOnLeaderboard[m]) {
                _addToRegistry(m);
            }
        }
        emit HistoryInitialized(_markees.length);
    }

    // ─────────────────────────────────────────────
    // Admin setters (leaderboard admin controls)
    // Note: revNetTerminal and revNetProjectId are NOT settable here.
    //       They are read from the factory and only the factory admin (Coop) can change them.
    // ─────────────────────────────────────────────

    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        address old = admin;
        admin = _newAdmin;
        emit AdminChanged(old, _newAdmin);
    }

    function setBeneficiaryAddress(address _newBeneficiary) external onlyAdmin {
        address old = beneficiaryAddress;
        beneficiaryAddress = _newBeneficiary;
        emit BeneficiaryChanged(old, _newBeneficiary);
    }

    function setPercentToBeneficiary(uint256 _newPercent) external onlyAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToBeneficiary;
        percentToBeneficiary = _newPercent;
        emit PercentToBeneficiaryChanged(old, _newPercent);
    }

    function setRevNetEnabled(bool _enabled) external onlyAdmin {
        revNetEnabled = _enabled;
        emit RevNetEnabledChanged(_enabled);
    }

    function setPlatformFeeReceiver(address _newReceiver) external onlyAdmin {
        address old = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;
        emit PlatformFeeReceiverChanged(old, _newReceiver);
    }

    function setPercentToPlatformFeeReceiver(uint256 _newPercent) external onlyAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToPlatformFeeReceiver;
        percentToPlatformFeeReceiver = _newPercent;
        emit PercentToPlatformFeeReceiverChanged(old, _newPercent);
    }

    function setMinimumPrice(uint256 _newPrice) external onlyAdmin {
        uint256 old = minimumPrice;
        minimumPrice = _newPrice;
        emit MinimumPriceChanged(old, _newPrice);
    }

    function setMaxMessageLength(uint256 _newLength) external onlyAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxMessageLength;
        maxMessageLength = _newLength;
        emit MaxMessageLengthChanged(old, _newLength);
    }

    function setMaxNameLength(uint256 _newLength) external onlyAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxNameLength;
        maxNameLength = _newLength;
        emit MaxNameLengthChanged(old, _newLength);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    function _deployFreeMarkee(address _owner) internal returns (address markeeAddress) {
        markeeAddress = _clone(markeeImplementation);
        Markee(markeeAddress).initialize(_owner, address(this), "", "", 0);
        _addToRegistry(markeeAddress);
        emit FreeMarkeeCreated(markeeAddress, _owner);
    }

    function _addToRegistry(address markeeAddress) internal {
        markeeIndex[markeeAddress] = markees.length;
        markees.push(markeeAddress);
        isMarkeeOnLeaderboard[markeeAddress] = true;
    }

    function _removeFromRegistry(address markeeAddress) internal {
        require(isMarkeeOnLeaderboard[markeeAddress], "Not in registry");
        uint256 index = markeeIndex[markeeAddress];
        address last = markees[markees.length - 1];
        markees[index] = last;
        markeeIndex[last] = index;
        markees.pop();
        delete markeeIndex[markeeAddress];
        isMarkeeOnLeaderboard[markeeAddress] = false;
    }

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
