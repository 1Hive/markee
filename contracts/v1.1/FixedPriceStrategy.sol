// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title FixedPriceStrategy
/// @notice A single-markee strategy where anyone pays a fixed ETH price to change the displayed message.
///
///         Implements IPricingStrategy so the v1.1 Markee clone reads all five routing values
///         (beneficiaryAddress, percentToBeneficiary, revNetEnabled, revNetTerminal, revNetProjectId)
///         dynamically from this contract at pay time. A single admin call here updates routing for
///         the connected Markee instantly — including the RevNet v5 → v6 terminal switch.
///
/// @dev RevNet routing is disabled by default (revNetEnabled = false, percentToBeneficiary = 10000).
///      100% of payments go to beneficiaryAddress until admin enables RevNet v6.
///      To activate RevNet: call setRevNetTerminal + setRevNetProjectId + setRevNetEnabled(true).
///
/// @dev Clones the v1.1 Markee implementation (EIP-1167 minimal proxy) in its constructor.
///      The Markee's pricingStrategy is permanently set to address(this) at initialization.
///      Ownership of the Markee (free-edit rights) is given to msg.sender at deploy time
///      and can be transferred via the Markee's own ownership functions.
contract FixedPriceStrategy is IPricingStrategy {

    string public constant VERSION = "1.1.0";

    // ─────────────────────────────────────────────
    // Singleton Markee
    // ─────────────────────────────────────────────

    /// @notice The single v1.1 Markee clone managed by this strategy
    address public immutable markeeAddress;

    // ─────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────

    /// @notice Can update price, beneficiary, RevNet config, and message length limits
    address public owner;

    // ─────────────────────────────────────────────
    // IPricingStrategy — read dynamically by Markee.pay()
    // ─────────────────────────────────────────────

    /// @inheritdoc IPricingStrategy
    address public override beneficiaryAddress;

    /// @inheritdoc IPricingStrategy
    /// @dev 10000 = 100% to beneficiary while revNetEnabled = false.
    ///      Lower to 6200 when RevNet v6 is live (restores 62/38 ETH split).
    uint256 public override percentToBeneficiary = 10000;

    /// @inheritdoc IPricingStrategy
    /// @dev false by default — flip to true once revNetTerminal + revNetProjectId are set.
    bool public override revNetEnabled = false;

    /// @inheritdoc IPricingStrategy
    /// @dev Populated by admin once RevNet v6 is live.
    address public override revNetTerminal;

    /// @inheritdoc IPricingStrategy
    /// @dev Populated by admin once RevNet v6 is live.
    uint256 public override revNetProjectId;

    /// @inheritdoc IPricingStrategy
    /// @dev address(0) → buyers receive 100% of MARKEE token issuance from the RevNet.
    ///      Set to the Markee Cooperative address to capture a token fee (optional).
    address public override platformFeeReceiver;

    /// @inheritdoc IPricingStrategy
    /// @dev Only applied when platformFeeReceiver != address(0). Default: 0 (no fee).
    uint256 public override percentToPlatformFeeReceiver;

    // ─────────────────────────────────────────────
    // Fixed-price config
    // ─────────────────────────────────────────────

    /// @notice ETH price in wei to change the message
    uint256 public price;

    /// @notice Maximum character count for a message
    uint256 public maxMessageLength;

    /// @notice Maximum character count for a name
    uint256 public maxNameLength;

    /// @notice Cumulative ETH routed through this strategy (tracks economic activity)
    uint256 public totalFundsRaised;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event MessageChanged(address indexed changedBy, string newMessage, string name, uint256 pricePaid);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BeneficiaryAddressUpdated(address indexed oldBeneficiary, address indexed newBeneficiary);
    event PercentToBeneficiaryUpdated(uint256 oldPercent, uint256 newPercent);
    event RevNetEnabledUpdated(bool enabled);
    event RevNetTerminalUpdated(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdUpdated(uint256 oldId, uint256 newId);
    event PlatformFeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    event PercentToPlatformFeeReceiverUpdated(uint256 oldPercent, uint256 newPercent);
    event MaxMessageLengthUpdated(uint256 oldLength, uint256 newLength);
    event MaxNameLengthUpdated(uint256 oldLength, uint256 newLength);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _markeeImplementation Deployed v1.1 Markee implementation to clone (EIP-1167)
    /// @param _initialMessage       Initial message to display on the Markee
    /// @param _initialName          Initial display name for the Markee
    /// @param _beneficiaryAddress   Address that receives 100% of payments until RevNet is live
    /// @param _price                Fixed ETH price in wei to change the message
    /// @param _maxMessageLength     Maximum character count allowed in a message
    /// @param _maxNameLength        Maximum character count allowed in a name
    constructor(
        address _markeeImplementation,
        string memory _initialMessage,
        string memory _initialName,
        address _beneficiaryAddress,
        uint256 _price,
        uint256 _maxMessageLength,
        uint256 _maxNameLength
    ) {
        require(_markeeImplementation != address(0), "Markee implementation cannot be zero");
        require(_price > 0, "Price must be > 0");
        require(_maxMessageLength > 0, "Max message length must be > 0");
        require(_maxNameLength > 0, "Max name length must be > 0");
        require(bytes(_initialMessage).length <= _maxMessageLength, "Message too long");
        require(bytes(_initialName).length <= _maxNameLength, "Name too long");

        owner = msg.sender;
        beneficiaryAddress = _beneficiaryAddress;
        price = _price;
        maxMessageLength = _maxMessageLength;
        maxNameLength = _maxNameLength;

        // Clone the v1.1 Markee implementation and initialize it.
        // pricingStrategy is set to address(this) so this contract controls
        // setMessage, setName, and pay on the Markee.
        address clone = _clone(_markeeImplementation);
        Markee(clone).initialize(
            msg.sender,    // owner — has free-edit rights via updateMessage()
            address(this), // pricingStrategy — must be this contract
            _initialMessage,
            _initialName,
            0              // no historical funds for a fresh deployment
        );
        markeeAddress = clone;
    }

    // ─────────────────────────────────────────────
    // Core: change message (payable)
    // ─────────────────────────────────────────────

    /// @notice Pay the fixed price to change the displayed message.
    /// @dev Validates payment and length limits, then delegates ETH routing to Markee.pay().
    ///      Markee reads the five IPricingStrategy values from this contract at call time —
    ///      no hardcoded routing here.
    /// @param _newMessage The new message to display
    /// @param _name       The new display name (pass empty string to leave unchanged)
    function changeMessage(string calldata _newMessage, string calldata _name) external payable {
        require(msg.value == price, "Payment must equal fixed price");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        if (bytes(_name).length > 0) {
            require(bytes(_name).length <= maxNameLength, "Name too long");
        }

        Markee markee = Markee(markeeAddress);
        markee.setMessage(_newMessage);
        markee.setName(_name);
        markee.pay{value: msg.value}(msg.sender);
        totalFundsRaised += msg.value;

        emit MessageChanged(msg.sender, _newMessage, _name, msg.value);
    }

    // ─────────────────────────────────────────────
    // Free edit (owner only, no payment)
    // ─────────────────────────────────────────────

    /// @notice Admin or Markee owner can update the message at no cost.
    function updateMessage(string calldata _newMessage, string calldata _name) external {
        require(
            msg.sender == owner || msg.sender == Markee(markeeAddress).owner(),
            "Not authorized"
        );
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        if (bytes(_name).length > 0) {
            require(bytes(_name).length <= maxNameLength, "Name too long");
        }
        Markee markee = Markee(markeeAddress);
        markee.setMessage(_newMessage);
        markee.setName(_name);
        emit MessageChanged(msg.sender, _newMessage, _name, 0);
    }

    // ─────────────────────────────────────────────
    // Strategy migration
    // ─────────────────────────────────────────────

    /// @notice Migrate the Markee to a new pricing strategy contract.
    /// @dev Calls Markee.setPricingStrategy(). Only possible while address(this) is the
    ///      current pricingStrategy. Use this to move to a future v1.2 strategy.
    function changePricingStrategy(address _newStrategy) external {
        require(msg.sender == owner, "Only owner");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        Markee(markeeAddress).setPricingStrategy(_newStrategy);
    }

    // ─────────────────────────────────────────────
    // Admin setters
    // ─────────────────────────────────────────────

    function setPrice(uint256 _newPrice) external {
        require(msg.sender == owner, "Only owner");
        require(_newPrice > 0, "Price must be > 0");
        uint256 old = price;
        price = _newPrice;
        emit PriceUpdated(old, _newPrice);
    }

    function setBeneficiaryAddress(address _newBeneficiary) external {
        require(msg.sender == owner, "Only owner");
        address old = beneficiaryAddress;
        beneficiaryAddress = _newBeneficiary;
        emit BeneficiaryAddressUpdated(old, _newBeneficiary);
    }

    function setPercentToBeneficiary(uint256 _newPercent) external {
        require(msg.sender == owner, "Only owner");
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToBeneficiary;
        percentToBeneficiary = _newPercent;
        emit PercentToBeneficiaryUpdated(old, _newPercent);
    }

    function setRevNetEnabled(bool _enabled) external {
        require(msg.sender == owner, "Only owner");
        revNetEnabled = _enabled;
        emit RevNetEnabledUpdated(_enabled);
    }

    function setRevNetTerminal(address _terminal) external {
        require(msg.sender == owner, "Only owner");
        require(_terminal != address(0), "Terminal cannot be zero address");
        address old = revNetTerminal;
        revNetTerminal = _terminal;
        emit RevNetTerminalUpdated(old, _terminal);
    }

    function setRevNetProjectId(uint256 _projectId) external {
        require(msg.sender == owner, "Only owner");
        uint256 old = revNetProjectId;
        revNetProjectId = _projectId;
        emit RevNetProjectIdUpdated(old, _projectId);
    }

    function setPlatformFeeReceiver(address _newReceiver) external {
        require(msg.sender == owner, "Only owner");
        address old = platformFeeReceiver;
        platformFeeReceiver = _newReceiver;
        emit PlatformFeeReceiverUpdated(old, _newReceiver);
    }

    function setPercentToPlatformFeeReceiver(uint256 _newPercent) external {
        require(msg.sender == owner, "Only owner");
        require(_newPercent <= 10000, "Cannot exceed 100%");
        uint256 old = percentToPlatformFeeReceiver;
        percentToPlatformFeeReceiver = _newPercent;
        emit PercentToPlatformFeeReceiverUpdated(old, _newPercent);
    }

    function setMaxMessageLength(uint256 _newLength) external {
        require(msg.sender == owner, "Only owner");
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxMessageLength;
        maxMessageLength = _newLength;
        emit MaxMessageLengthUpdated(old, _newLength);
    }

    function setMaxNameLength(uint256 _newLength) external {
        require(msg.sender == owner, "Only owner");
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxNameLength;
        maxNameLength = _newLength;
        emit MaxNameLengthUpdated(old, _newLength);
    }

    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "Only owner");
        require(_newOwner != address(0), "New owner cannot be zero address");
        address old = owner;
        owner = _newOwner;
        emit OwnershipTransferred(old, _newOwner);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

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
