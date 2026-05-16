// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title Leaderboard v1.3
/// @notice A pricing strategy contract that manages a ranked collection of Markee message boards.
///
/// @dev Changes from v1.2:
///      - revNetEnabled, percentToBeneficiary, platformFeeReceiver, and
///        percentToPlatformFeeReceiver are NO LONGER stored per-leaderboard.
///        They join revNetTerminal and revNetProjectId as factory-level values read via
///        ILeaderboardFactory. Only the factory admin (Markee Cooperative multisig) can change
///        them, and a single factory update applies to every v1.3 leaderboard simultaneously —
///        including an emergency RevNet disable if a vulnerability is discovered.
///      - setRevNetEnabled(), setPercentToBeneficiary(), setPlatformFeeReceiver(), and
///        setPercentToPlatformFeeReceiver() are removed. Leaderboard admin retains control only
///        over beneficiaryAddress, admin, minimumPrice, maxMessageLength, and maxNameLength.
///      - createFreeMarkee() is removed. The seed Markee created in initialize() is sufficient;
///        migrateFromLegacy() handles all historical Markees.
///      - LeaderboardFactory now deploys both Leaderboard and Markee implementations in its
///        constructor — no pre-deployment steps needed.
///
/// @dev Deployed as a minimal proxy clone by LeaderboardFactory (EIP-1167).
///      Do not deploy this contract directly.
contract Leaderboard is IPricingStrategy {

    string public constant VERSION = "1.3.0";

    // ─── Initialized-once config ──────────────────────────────────────────────

    address public markeeImplementation;

    /// @notice The factory that deployed this Leaderboard.
    /// @dev Used to read all RevNet and fee config at pay-time via ILeaderboardFactory.
    address public factory;

    bool public initialized;

    // ─── Admin-mutable per-leaderboard config ─────────────────────────────────

    address public admin;

    /// @notice Address that receives the beneficiary share of every payment (leaderboard creator's treasury).
    address public override beneficiaryAddress;

    // revNetEnabled, percentToBeneficiary, revNetTerminal, revNetProjectId,
    // platformFeeReceiver, and percentToPlatformFeeReceiver are all factory-controlled.
    // See proxy functions below — they satisfy IPricingStrategy by delegating to ILeaderboardFactory.

    bool public historyInitialized;
    uint256 public minimumPrice;
    uint256 public maxMessageLength;
    uint256 public maxNameLength;
    string public leaderboardName;

    // ─── Markee registry ──────────────────────────────────────────────────────

    address[] public markees;
    mapping(address => uint256) private markeeIndex;
    mapping(address => bool) public isMarkeeOnLeaderboard;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name, uint256 amount);
    event FreeMarkeeCreated(address indexed markeeAddress, address indexed owner);
    event MarkeeMigratedFromLegacy(address indexed newMarkeeAddress, address indexed oldMarkeeAddress, address indexed owner, uint256 historicalFunds);
    event FundsAdded(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 newMarkeeTotal);
    event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage);
    event NameUpdated(address indexed markeeAddress, address indexed updatedBy, string newName);
    event MarkeeLeft(address indexed markeeAddress);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event HistoryInitialized(uint256 markeeCount);
    event MinimumPriceChanged(uint256 oldPrice, uint256 newPrice);
    event MaxMessageLengthChanged(uint256 oldLength, uint256 newLength);
    event MaxNameLengthChanged(uint256 oldLength, uint256 newLength);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // ─── Initializer ──────────────────────────────────────────────────────────

    /// @notice Initialises a cloned Leaderboard. Called once by LeaderboardFactory immediately
    ///         after cloning. Also deploys the seed Markee owned by the leaderboard creator.
    /// @dev platformFeeReceiver, revNetEnabled, percentToBeneficiary, revNetTerminal,
    ///      revNetProjectId, and percentToPlatformFeeReceiver are NOT parameters — they are
    ///      read from the factory at pay-time via ILeaderboardFactory.
    function initialize(
        address _admin,
        address _beneficiaryAddress,
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
        leaderboardName = _leaderboardName;
        markeeImplementation = _markeeImplementation;
        minimumPrice = _minimumPrice;
        maxMessageLength = _maxMessageLength;
        maxNameLength = _maxNameLength;

        seedMarkeeAddress = _deployFreeMarkee(_seedOwner);
    }

    // ─── Factory-proxied IPricingStrategy values ──────────────────────────────
    // These satisfy IPricingStrategy by delegating to the factory (ILeaderboardFactory).
    // The Markee Cooperative updates all leaderboards on this factory with one transaction.

    function revNetEnabled() external view override returns (bool) {
        return ILeaderboardFactory(factory).revNetEnabled();
    }

    function percentToBeneficiary() external view override returns (uint256) {
        return ILeaderboardFactory(factory).percentToBeneficiary();
    }

    function revNetTerminal() external view override returns (address) {
        return ILeaderboardFactory(factory).revNetTerminal();
    }

    function revNetProjectId() external view override returns (uint256) {
        return ILeaderboardFactory(factory).revNetProjectId();
    }

    function platformFeeReceiver() external view override returns (address) {
        return ILeaderboardFactory(factory).platformFeeReceiver();
    }

    function percentToPlatformFeeReceiver() external view override returns (uint256) {
        return ILeaderboardFactory(factory).percentToPlatformFeeReceiver();
    }

    // ─── Markee creation ──────────────────────────────────────────────────────

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

    // ─── Funding ──────────────────────────────────────────────────────────────

    function addFunds(address _markeeAddress) external payable {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(msg.value > 0, "Must send ETH");
        Markee markee = Markee(_markeeAddress);
        markee.pay{value: msg.value}(msg.sender);
        emit FundsAdded(_markeeAddress, msg.sender, msg.value, markee.totalFundsAdded());
    }

    // ─── Free edits ───────────────────────────────────────────────────────────

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

    // ─── Migration ────────────────────────────────────────────────────────────

    /// @notice Moves a Markee from this leaderboard to a new pricing strategy.
    /// @dev The Markee is removed from this registry; the new strategy must register it.
    function migratePricingStrategy(address _markeeAddress, address _newStrategy) external onlyAdmin {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        _removeFromRegistry(_markeeAddress);
        Markee(_markeeAddress).setPricingStrategy(_newStrategy);
    }

    /// @notice Removes a Markee that has already switched to a different pricing strategy.
    function markeeLeft(address _markeeAddress) external {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(
            Markee(_markeeAddress).pricingStrategy() != address(this),
            "Markee still on this leaderboard"
        );
        _removeFromRegistry(_markeeAddress);
        emit MarkeeLeft(_markeeAddress);
    }

    /// @notice Migrates a legacy Markee (any prior version) to this v1.3 leaderboard.
    /// @dev Creates a new v1.3 Markee clone seeded with the old clone's owner, message, name,
    ///      and totalFundsAdded. Historical funds are read directly from the old clone's
    ///      on-chain state and cannot be inflated.
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

    // ─── Leaderboard queries ──────────────────────────────────────────────────

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

    // ─── History seeding ──────────────────────────────────────────────────────

    /// @notice Registers existing Markee addresses directly into this leaderboard's registry.
    /// @dev One-time admin call. Useful when Markees have already been transferred to this
    ///      leaderboard via migratePricingStrategy on the old Leaderboard and only need
    ///      registry registration here. For Markees still on a legacy leaderboard, prefer
    ///      migrateFromLegacy() which also creates a fresh v1.3 clone.
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

    // ─── Admin setters (leaderboard admin only) ───────────────────────────────
    // RevNet config is NOT settable here — it is factory-controlled (Coop multisig only).

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

    // ─── Internal helpers ─────────────────────────────────────────────────────

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
