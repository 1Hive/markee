// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Interfaces.sol";

/// @title Markee
/// @notice A message board contract that stores a message and name, tracks total funds,
///         and routes payments to a community beneficiary and the Markee Cooperative RevNet.
/// @dev Payment routing is handled entirely within this contract. The pricing strategy
///      determines *whether* a payment is valid and calls pay(), but cannot alter where
///      funds go. RevNet terminal, RevNet project ID, and percent to beneficiary are all
///      set once at initialization and never change.
/// @dev Deployed as a minimal proxy clone by Leaderboard (EIP-1167). Do not deploy directly.
/// @dev All instances deployed on Base (canonical chain).
contract Markee {
    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    string public constant VERSION = "1.0.0";
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    // ─────────────────────────────────────────────
    // Initialized-once config (set by initialize(), never changes after)
    // ─────────────────────────────────────────────

    /// @notice Juicebox multi-terminal used for RevNet payments
    address public revNetTerminal;

    /// @notice The Markee Cooperative RevNet project ID
    uint256 public revNetProjectId;

    /// @notice Percentage of every payment routed to the community beneficiary, in basis points
    /// @dev 6200 = 62%. The remainder (38%) goes to the RevNet.
    uint256 public percentToBeneficiary;

    /// @notice Guard preventing initialize() from being called more than once
    bool public initialized;

    // ─────────────────────────────────────────────
    // Mutable state
    // ─────────────────────────────────────────────

    /// @notice The current message displayed on this Markee
    string public message;

    /// @notice The optional display name associated with this Markee's owner
    string public name;

    /// @notice Cumulative ETH (in wei) ever sent through pay() on this Markee
    /// @dev Used as the leaderboard ranking metric. Reflects economic weight over the lifetime
    ///      of this Markee regardless of which strategy is currently active.
    uint256 public totalFundsAdded;

    /// @notice The address authorised to call setMessage, setName, and pay on this Markee
    /// @dev Always a pricing strategy contract (e.g. a Leaderboard). Can be changed by
    ///      the current strategy via setPricingStrategy().
    address public pricingStrategy;

    /// @notice The owner of this Markee — entitled to free message and name edits via the strategy
    address public owner;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event MessageChanged(string newMessage, address indexed changedBy);
    event NameChanged(string newName, address indexed changedBy);
    event PaymentReceived(
        uint256 totalAmount,
        uint256 beneficiaryAmount,
        uint256 revNetAmount,
        address indexed tokenRecipient,
        uint256 newTotalFundsAdded
    );
    event PricingStrategyChanged(address indexed oldStrategy, address indexed newStrategy);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    // ─────────────────────────────────────────────
    // Initializer (replaces constructor for clone pattern)
    // ─────────────────────────────────────────────

    /// @notice Initialises a cloned Markee. Called once by Leaderboard immediately after cloning.
    /// @dev Reverts if called a second time.
    /// @param _owner The initial owner (typically the buyer/creator)
    /// @param _pricingStrategy The strategy contract authorised to call mutations (typically a Leaderboard)
    /// @param _revNetTerminal Address of the Juicebox terminal for RevNet payments
    /// @param _revNetProjectId The Markee Cooperative RevNet project ID
    /// @param _initialMessage The initial message to display
    /// @param _name The optional display name (max 22 chars enforced by strategy)
    function initialize(
        address _owner,
        address _pricingStrategy,
        address _revNetTerminal,
        uint256 _revNetProjectId,
        string calldata _initialMessage,
        string calldata _name
    ) external {
        require(!initialized, "Already initialized");
        require(_owner != address(0), "Owner cannot be zero address");
        require(_pricingStrategy != address(0), "Strategy cannot be zero address");
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");

        initialized = true;

        owner = _owner;
        pricingStrategy = _pricingStrategy;
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        percentToBeneficiary = 6200; // 62%
        message = _initialMessage;
        name = _name;

        emit MessageChanged(_initialMessage, _pricingStrategy);
        if (bytes(_name).length > 0) {
            emit NameChanged(_name, _pricingStrategy);
        }
    }

    // ─────────────────────────────────────────────
    // Payment
    // ─────────────────────────────────────────────

    /// @notice Accepts ETH, splits it between the community beneficiary and the Markee Cooperative RevNet,
    ///         and records the full amount against totalFundsAdded.
    /// @dev Only callable by pricingStrategy. The strategy is responsible for validating the payment
    ///      conditions (minimum price, caller permissions, etc.) before forwarding here.
    ///      beneficiaryAddress is read dynamically from the strategy so a single admin call on
    ///      the Leaderboard updates routing for every Markee it manages.
    /// @param tokenRecipient Address that should receive MARKEE tokens from the RevNet
    function pay(address tokenRecipient) external payable {
        require(initialized, "Not initialized");
        require(msg.sender == pricingStrategy, "Only pricing strategy can call pay");
        require(msg.value > 0, "Payment must be greater than zero");

        uint256 amount = msg.value;

        // Read beneficiary address dynamically from strategy
        address beneficiary = IPricingStrategy(pricingStrategy).beneficiaryAddress();

        uint256 beneficiaryAmount = (amount * percentToBeneficiary) / BASIS_POINTS_DIVISOR;
        uint256 revNetAmount = amount - beneficiaryAmount;

        // Route to community beneficiary
        if (beneficiary != address(0) && beneficiaryAmount > 0) {
            (bool success, ) = beneficiary.call{value: beneficiaryAmount}("");
            require(success, "Transfer to beneficiary failed");
        } else {
            // If no beneficiary set, full amount goes to RevNet
            revNetAmount = amount;
        }

        // Route to Markee Cooperative RevNet — token recipient receives MARKEE tokens
        if (revNetAmount > 0) {
            IJBMultiTerminal(revNetTerminal).pay{value: revNetAmount}(
                revNetProjectId,
                NATIVE_TOKEN,
                revNetAmount,
                tokenRecipient,
                0,
                "",
                ""
            );
        }

        totalFundsAdded += amount;

        emit PaymentReceived(amount, beneficiaryAmount, revNetAmount, tokenRecipient, totalFundsAdded);
    }

    // ─────────────────────────────────────────────
    // Message & name setters
    // ─────────────────────────────────────────────

    /// @notice Updates the displayed message
    /// @dev Only callable by pricingStrategy. The strategy enforces owner checks and length limits.
    function setMessage(string calldata _message) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy can set message");
        message = _message;
        emit MessageChanged(_message, tx.origin);
    }

    /// @notice Updates the display name
    /// @dev Only callable by pricingStrategy. The strategy enforces owner checks and length limits.
    function setName(string calldata _name) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy can set name");
        name = _name;
        emit NameChanged(_name, tx.origin);
    }

    // ─────────────────────────────────────────────
    // Strategy & ownership
    // ─────────────────────────────────────────────

    /// @notice Switches the pricing strategy for this Markee
    /// @dev Only callable by the current pricingStrategy. When a Markee leaves a Leaderboard,
    ///      the Leaderboard calls this on the Markee's behalf, then the Leaderboard's markeeLeft()
    ///      can be called to clean up the array.
    /// @param _newStrategy The new pricing strategy contract address
    function setPricingStrategy(address _newStrategy) external {
        require(msg.sender == pricingStrategy, "Only current pricing strategy can change strategy");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        address old = pricingStrategy;
        pricingStrategy = _newStrategy;
        emit PricingStrategyChanged(old, _newStrategy);
    }

    /// @notice Transfers Markee ownership (free edit rights) to a new address
    /// @dev Only callable by pricingStrategy. The strategy verifies the caller is the current owner.
    function transferOwnership(address _newOwner) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy can transfer ownership");
        require(_newOwner != address(0), "Owner cannot be zero address");
        address old = owner;
        owner = _newOwner;
        emit OwnerChanged(old, _newOwner);
    }
}
