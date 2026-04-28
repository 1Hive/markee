// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title Leaderboard
/// @notice A pricing strategy contract that manages a ranked collection of Markee message boards.
///         Markees are ranked by totalFundsAdded: whichever message has been funded with the most
///         ETH sits at the top.
///
/// @dev This contract acts as pricingStrategy for every Markee it creates. It enforces:
///        - Minimum price to create a new Markee
///        - Message and name length limits
///        - Free edits for Markee owners
///        - Open fund contributions from anyone
///        - Payment routing via Markee.pay() — funds always flow through Markee's routing logic
///
/// @dev Implements IPricingStrategy so that Markee reads all five routing values (beneficiaryAddress,
///      percentToBeneficiary, revNetEnabled, revNetTerminal, revNetProjectId) dynamically from here.
///      A single admin call on this Leaderboard propagates instantly to every connected Markee —
///      including the RevNet terminal swap when v6 goes live. No per-Markee migrations ever needed.
///
/// @dev Deployed as a minimal proxy clone by LeaderboardFactory (EIP-1167).
///      Do not deploy this contract directly.
contract Leaderboard is IPricingStrategy {

    // ─────────────────────────────────────────────
    // Version
    // ─────────────────────────────────────────────

    string public constant VERSION = "1.1.0";

    // ─────────────────────────────────────────────
    // Initialized-once config (set by initialize(), never changes after)
    // ─────────────────────────────────────────────

    /// @notice Markee implementation contract: cloned for every new message slot
    /// @dev Storing as a reference rather than using `new Markee()` keeps Leaderboard
    ///      under the 24KB contract size limit (EIP-170).
    address public markeeImplementation;

    /// @notice The factory that deployed this Leaderboard — identifies the platform context
    address public factory;

    /// @notice Guard preventing initialize() from being called more than once
    bool public initialized;

    // ─────────────────────────────────────────────
    // Admin-mutable config (implements IPricingStrategy)
    // ─────────────────────────────────────────────

    /// @notice Address with admin rights over this Leaderboard instance
    address public admin;

    /// @notice Address that receives the beneficiary share of every payment made through connected Markees
    /// @dev Read dynamically by each Markee at payment time via IPricingStrategy.beneficiaryAddress()
    address public override beneficiaryAddress;

    /// @notice Beneficiary share in basis points; read by each Markee at payment time
    /// @dev 10000 = 100% (all funds go to beneficiary, RevNet skipped). Restore to 6200 when RevNet v6 is live.
    uint256 public override percentToBeneficiary = 10000;

    /// @notice When false, Markees skip the RevNet call and route 100% to beneficiaryAddress
    /// @dev Flip to true (along with setting revNetTerminal + revNetProjectId) to activate RevNet v6
    bool public override revNetEnabled = false;

    /// @notice Juicebox multi-terminal address for RevNet payments
    /// @dev Read dynamically by each Markee via IPricingStrategy.revNetTerminal(). Update once when v6 is live.
    address public override revNetTerminal;

    /// @notice Markee Cooperative RevNet project ID
    /// @dev Read dynamically by each Markee via IPricingStrategy.revNetProjectId(). Update once when v6 is live.
    uint256 public override revNetProjectId;

    /// @notice Address that receives a share of MARKEE token issuance from every RevNet payment
    /// @dev Set by the factory at creation time. When address(0), 100% of MARKEE issuance goes to
    ///      the buyer. Read dynamically by each Markee at pay time via IPricingStrategy.
    address public override platformFeeReceiver;

    /// @notice Platform fee receiver's share of RevNet ETH in basis points (10000 = 100%)
    /// @dev Default is 3800 (38% to fee receiver, 62% to buyer). Only applied when platformFeeReceiver != address(0).
    uint256 public override percentToPlatformFeeReceiver = 3800;

    /// @notice Guard ensuring initializeHistory() is called at most once
    bool public historyInitialized;

    /// @notice Minimum ETH (in wei) required to create a new Markee on this leaderboard
    uint256 public minimumPrice;

    /// @notice Maximum number of characters allowed in a Markee message
    uint256 public maxMessageLength;

    /// @notice Maximum number of characters allowed in a Markee display name
    uint256 public maxNameLength;

    /// @notice Optional human-readable name for this leaderboard (e.g. "Gardens")
    string public leaderboardName;

    // ─────────────────────────────────────────────
    // Markee registry
    // ─────────────────────────────────────────────

    /// @notice Ordered list of all Markee addresses currently on this leaderboard
    address[] public markees;

    /// @notice Maps a Markee address to its index in the markees array for O(1) removal
    mapping(address => uint256) private markeeIndex;

    /// @notice Returns true if the address is a Markee currently on this leaderboard
    mapping(address => bool) public isMarkeeOnLeaderboard;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event MarkeeCreated(
        address indexed markeeAddress,
        address indexed owner,
        string message,
        string name,
        uint256 amount
    );
    event FreeMarkeeCreated(
        address indexed markeeAddress,
        address indexed owner
    );
    event MarkeeMigratedFromLegacy(
        address indexed newMarkeeAddress,
        address indexed oldMarkeeAddress,
        address indexed owner,
        uint256 historicalFunds
    );
    event FundsAdded(
        address indexed markeeAddress,
        address indexed addedBy,
        uint256 amount,
        uint256 newMarkeeTotal
    );
    event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage);
    event NameUpdated(address indexed markeeAddress, address indexed updatedBy, string newName);
    event MarkeeLeft(address indexed markeeAddress);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event PercentToBeneficiaryChanged(uint256 oldPercent, uint256 newPercent);
    event RevNetEnabledChanged(bool enabled);
    event RevNetTerminalChanged(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdChanged(uint256 oldId, uint256 newId);
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
    // Initializer (replaces constructor for clone pattern)
    // ─────────────────────────────────────────────

    /// @notice Initialises a cloned Leaderboard. Called once by LeaderboardFactory immediately
    ///         after cloning. Also deploys the seed Markee owned by the leaderboard creator.
    /// @dev RevNet terminal and project ID are NOT passed at init — they default to zero and are
    ///      set by admin via setRevNetTerminal/setRevNetProjectId once RevNet v6 is live.
    ///      This avoids baking stale config into the Leaderboard and prevents the v5/v6 migration
    ///      problem where terminal addresses were locked at initialization time.
    /// @param _admin Address that will have admin rights over this leaderboard
    /// @param _beneficiaryAddress Initial ETH beneficiary address (e.g. the platform/partner)
    /// @param _platformFeeReceiver Address that receives a share of MARKEE issuance from the RevNet.
    ///        Pass address(0) to send 100% of MARKEE to buyers. Set by the factory so the Markee
    ///        Cooperative captures its token cut across all leaderboards.
    /// @param _leaderboardName Human-readable name for this leaderboard
    /// @param _markeeImplementation Markee implementation contract to clone for each message slot
    /// @param _minimumPrice Minimum ETH to create a Markee (default 0.001 ETH from factory)
    /// @param _maxMessageLength Max message length in characters (default 222 from factory)
    /// @param _maxNameLength Max name length in characters (default 22 from factory)
    /// @param _seedOwner Address to own the free seed Markee (typically the leaderboard creator)
    /// @return seedMarkeeAddress The address of the deployed seed Markee
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

        // revNetTerminal and revNetProjectId intentionally left as zero —
        // admin sets them once via setRevNetTerminal/setRevNetProjectId when v6 is live.

        seedMarkeeAddress = _deployFreeMarkee(_seedOwner);
    }

    // ─────────────────────────────────────────────
    // Markee creation
    // ─────────────────────────────────────────────

    /// @notice Creates a new Markee and places it on this leaderboard
    /// @dev Caller pays at least minimumPrice. Payment is forwarded to Markee.pay() which
    ///      routes funds according to percentToBeneficiary and revNetEnabled — both read
    ///      dynamically from this contract.
    /// @param _message The initial message to display
    /// @param _name The optional display name (max maxNameLength chars)
    /// @return markeeAddress The address of the newly deployed Markee clone
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

        Markee(markeeAddress).initialize(
            msg.sender,
            address(this),
            _message,
            _name,
            0  // no historical funds for a fresh Markee
        );

        _addToRegistry(markeeAddress);

        Markee(markeeAddress).pay{value: msg.value}(msg.sender);

        emit MarkeeCreated(markeeAddress, msg.sender, _message, _name, msg.value);
    }

    /// @notice Creates a free Markee with no payment requirement
    /// @dev Only callable by admin. The deployed Markee has totalFundsAdded = 0 and will sit
    ///      at the bottom of the leaderboard until the first paying buyer overtakes it.
    /// @param _owner Address to set as owner of the Markee
    /// @return markeeAddress The address of the deployed Markee
    function createFreeMarkee(address _owner)
        external
        onlyAdmin
        returns (address markeeAddress)
    {
        markeeAddress = _deployFreeMarkee(_owner);
    }

    // ─────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────

    /// @notice Adds funds to an existing Markee to boost its leaderboard position
    /// @dev Anyone can call this for any Markee on this leaderboard.
    ///      Payment routes through Markee.pay() per current percentToBeneficiary + revNetEnabled.
    /// @param _markeeAddress The Markee to boost
    function addFunds(address _markeeAddress) external payable {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(msg.value > 0, "Must send ETH");

        Markee markee = Markee(_markeeAddress);
        markee.pay{value: msg.value}(msg.sender);

        emit FundsAdded(_markeeAddress, msg.sender, msg.value, markee.totalFundsAdded());
    }

    // ─────────────────────────────────────────────
    // Free edits (owner only, no payment required)
    // ─────────────────────────────────────────────

    /// @notice Allows the Markee owner to update their message at no cost
    function updateMessage(address _markeeAddress, string calldata _newMessage) external {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        Markee markee = Markee(_markeeAddress);
        require(msg.sender == markee.owner(), "Only Markee owner");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");

        markee.setMessage(_newMessage);
        emit MessageUpdated(_markeeAddress, msg.sender, _newMessage);
    }

    /// @notice Allows the Markee owner to update their display name at no cost
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

    /// @notice Pricing strategy migration — moves a Markee to a new strategy contract
    /// @dev The Markee itself calls setPricingStrategy, so this Leaderboard must be the
    ///      current pricingStrategy for the call to succeed. After migration the Markee
    ///      is removed from this leaderboard's registry.
    /// @param _markeeAddress The Markee to migrate
    /// @param _newStrategy The new pricing strategy contract to assign
    function migratePricingStrategy(address _markeeAddress, address _newStrategy)
        external
        onlyAdmin
    {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(_newStrategy != address(0), "Strategy cannot be zero address");

        _removeFromRegistry(_markeeAddress);
        Markee(_markeeAddress).setPricingStrategy(_newStrategy);
    }

    /// @notice Removes a Markee from this leaderboard's registry if it has already switched strategy
    /// @dev Anyone can call this. Verifies the Markee has actually left before removing.
    /// @param _markeeAddress The Markee to remove
    function markeeLeft(address _markeeAddress) external {
        require(isMarkeeOnLeaderboard[_markeeAddress], "Markee not on this leaderboard");
        require(
            Markee(_markeeAddress).pricingStrategy() != address(this),
            "Markee still on this leaderboard"
        );
        _removeFromRegistry(_markeeAddress);
        emit MarkeeLeft(_markeeAddress);
    }

    /// @notice Migrates a legacy Markee clone to this leaderboard by reading its on-chain state
    /// @dev Creates a new v1.1 Markee clone seeded with the old clone's owner, message, name, and
    ///      totalFundsAdded. The historical funds value is read directly from the old clone —
    ///      it cannot be inflated by admin, as the old clone accumulated it from real ETH flows.
    ///      Anyone can verify the old clone's totalFundsAdded on-chain to confirm no tampering.
    ///      The old Markee address is NOT registered here; the new address should be surfaced to
    ///      users via an address-mapping in the frontend (oldAddress → newAddress).
    /// @param _oldMarkee Address of the legacy Markee clone to migrate
    /// @return newMarkeeAddress The address of the newly deployed v1.1 Markee clone
    function migrateFromLegacy(address _oldMarkee)
        external
        onlyAdmin
        returns (address newMarkeeAddress)
    {
        require(_oldMarkee != address(0), "Old markee cannot be zero address");
        require(!isMarkeeOnLeaderboard[_oldMarkee], "Already on this leaderboard");

        Markee old = Markee(_oldMarkee);

        address oldOwner = old.owner();
        string memory oldMessage = old.message();
        string memory oldName = old.name();
        uint256 historicalFunds = old.totalFundsAdded();

        newMarkeeAddress = _clone(markeeImplementation);

        Markee(newMarkeeAddress).initialize(
            oldOwner,
            address(this),
            oldMessage,
            oldName,
            historicalFunds
        );

        _addToRegistry(newMarkeeAddress);

        emit MarkeeMigratedFromLegacy(newMarkeeAddress, _oldMarkee, oldOwner, historicalFunds);
    }

    // ─────────────────────────────────────────────
    // Leaderboard query
    // ─────────────────────────────────────────────

    /// @notice Returns the total number of Markees currently on this leaderboard
    function markeeCount() external view returns (uint256) {
        return markees.length;
    }

    /// @notice Returns the sum of totalFundsAdded across all Markees on this leaderboard
    function totalLeaderboardFunds() external view returns (uint256 total) {
        for (uint256 i = 0; i < markees.length; i++) {
            total += Markee(markees[i]).totalFundsAdded();
        }
    }

    /// @notice Returns a paginated slice of the markees array (unranked, insertion order)
    /// @dev Pair with off-chain multicall to read totalFundsAdded for each address and sort client-side.
    /// @param offset Start index
    /// @param limit Max number of addresses to return
    function getMarkees(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory result)
    {
        uint256 end = offset + limit;
        if (end > markees.length) end = markees.length;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = markees[i];
        }
    }

    /// @notice Returns the top N Markees by totalFundsAdded
    /// @dev Performs an in-memory sort — only suitable for leaderboards under ~500 Markees.
    ///      For larger leaderboards use getMarkees() + off-chain multicall sort.
    /// @param limit Number of top entries to return
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

    /// @notice Seeds historical Markee state from a prior deployment. One-time call.
    /// @dev Registers existing Markee addresses without creating new ones. Allows a fresh
    ///      deployment to carry forward historical leaderboard membership.
    ///      Call this once immediately after initialize() before any user activity.
    ///      For v1.0 → v1.1 migration, prefer migrateFromLegacy() per Markee instead — it
    ///      creates new v1.1 clones that read routing config from this Leaderboard correctly.
    /// @param _markees Existing Markee addresses to register
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
    // Admin setters
    // ─────────────────────────────────────────────

    /// @notice Transfers admin rights to a new address
    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        address old = admin;
        admin = _newAdmin;
        emit AdminChanged(old, _newAdmin);
    }

    /// @notice Updates the community beneficiary address
    /// @dev Takes effect immediately for all connected Markees — Markee reads this dynamically at pay time
    function setBeneficiaryAddress(address _newBeneficiary) external onlyAdmin {
        address old = beneficiaryAddress;
        beneficiaryAddress = _newBeneficiary;
        emit BeneficiaryChanged(old, _newBeneficiary);
    }

    /// @notice Updates the beneficiary share in basis points (10000 = 100%)
    /// @dev Set to 6200 when RevNet v6 is ready to restore the 62/38 split
    function setPercentToBeneficiary(uint256 _newPercent) external onlyAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToBeneficiary;
        percentToBeneficiary = _newPercent;
        emit PercentToBeneficiaryChanged(old, _newPercent);
    }

    /// @notice Enables or disables RevNet routing
    /// @dev Set to true (with updated terminal + projectId) to activate RevNet v6
    function setRevNetEnabled(bool _enabled) external onlyAdmin {
        revNetEnabled = _enabled;
        emit RevNetEnabledChanged(_enabled);
    }

    /// @notice Updates the RevNet terminal address
    /// @dev Call this once when RevNet v6 is deployed. Takes effect for all connected Markees
    ///      immediately — no per-Markee migrations needed.
    function setRevNetTerminal(address _newTerminal) external onlyAdmin {
        require(_newTerminal != address(0), "Terminal cannot be zero address");
        address old = revNetTerminal;
        revNetTerminal = _newTerminal;
        emit RevNetTerminalChanged(old, _newTerminal);
    }

    /// @notice Updates the RevNet project ID
    /// @dev Call this once when RevNet v6 is deployed.
    function setRevNetProjectId(uint256 _newProjectId) external onlyAdmin {
        uint256 old = revNetProjectId;
        revNetProjectId = _newProjectId;
        emit RevNetProjectIdChanged(old, _newProjectId);
    }

    /// @notice Updates the platform fee receiver address
    /// @dev Set to address(0) to route 100% of MARKEE issuance to buyers
    function setPlatformFeeReceiver(address _newReceiver) external onlyAdmin {
        address old = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;
        emit PlatformFeeReceiverChanged(old, _newReceiver);
    }

    /// @notice Updates the platform fee receiver's share of RevNet ETH in basis points (10000 = 100%)
    /// @dev Only applied when platformFeeReceiver != address(0)
    function setPercentToPlatformFeeReceiver(uint256 _newPercent) external onlyAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToPlatformFeeReceiver;
        percentToPlatformFeeReceiver = _newPercent;
        emit PercentToPlatformFeeReceiverChanged(old, _newPercent);
    }

    /// @notice Updates the minimum price to create a new Markee
    function setMinimumPrice(uint256 _newPrice) external onlyAdmin {
        uint256 old = minimumPrice;
        minimumPrice = _newPrice;
        emit MinimumPriceChanged(old, _newPrice);
    }

    /// @notice Updates the maximum message length (applies to future edits and creations)
    function setMaxMessageLength(uint256 _newLength) external onlyAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxMessageLength;
        maxMessageLength = _newLength;
        emit MaxMessageLengthChanged(old, _newLength);
    }

    /// @notice Updates the maximum name length (applies to future edits and creations)
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
        Markee(markeeAddress).initialize(
            _owner,
            address(this),
            "",   // empty message — owner can set via updateMessage for free
            "",
            0
        );
        _addToRegistry(markeeAddress);
        emit FreeMarkeeCreated(markeeAddress, _owner);
    }

    function _addToRegistry(address markeeAddress) internal {
        markeeIndex[markeeAddress] = markees.length;
        markees.push(markeeAddress);
        isMarkeeOnLeaderboard[markeeAddress] = true;
    }

    /// @dev Swap-and-pop for O(1) removal without shifting the array
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

    /// @notice Deploys a minimal proxy (EIP-1167) clone of the given implementation
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
