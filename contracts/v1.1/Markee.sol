// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Interfaces.sol";

/// @title Markee
/// @notice A message board contract that stores a message and name, tracks total funds,
///         and routes payments to a community beneficiary and the Markee Cooperative RevNet.
///
/// @dev Payment routing is handled within this contract. The pricing strategy determines
///      *whether* a payment is valid and calls pay(), but cannot alter where funds go
///      without being explicitly set as the pricingStrategy by the current strategy (admin-gated).
///
/// @dev All five routing parameters (beneficiaryAddress, percentToBeneficiary, revNetEnabled,
///      revNetTerminal, revNetProjectId) are read dynamically from the pricingStrategy at pay time.
///      This means a single admin call on the Leaderboard updates routing for every connected
///      Markee instantly — including the RevNet terminal when v6 goes live. No per-Markee
///      migrations are ever needed.
///
/// @dev Deployed as a minimal proxy clone by Leaderboard (EIP-1167). Do not deploy directly.
/// @dev All instances deployed on Base (canonical chain).
contract Markee {
    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    string public constant VERSION = "1.1.0";
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    // ─────────────────────────────────────────────
    // Initialized-once config (set by initialize(), never changes after)
    // ─────────────────────────────────────────────

    /// @notice Guard preventing initialize() from being called more than once
    bool public initialized;

    // ─────────────────────────────────────────────
    // Mutable state
    // ─────────────────────────────────────────────

    /// @notice The current message displayed on this Markee
    string public message;

    /// @notice The optional display name associated with this Markee's owner
    string public name;

    /// @notice Cumulative ETH (in wei) ever credited to this Markee
    /// @dev Used as the leaderboard ranking metric and as a tamper-proof economic signal for
    ///      funding allocation (e.g. MARKEE token grants from the Community Reserve). Reflects
    ///      real ETH paid through pay() plus any historical funds seeded at initialization.
    ///      Cannot be incremented except through pay() — verifiable on-chain.
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
        uint256 revNetBuyerAmount,
        uint256 revNetFeeReceiverAmount,
        address indexed tokenRecipient,
        uint256 newTotalFundsAdded
    );
    event PricingStrategyChanged(address indexed oldStrategy, address indexed newStrategy);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    // ─────────────────────────────────────────────
    // Initializer (replaces constructor for clone pattern)
    // ─────────────────────────────────────────────

    /// @notice Initialises a cloned Markee. Called once by Leaderboard immediately after cloning.
    /// @dev Reverts if called a second time. RevNet terminal and project ID are NOT stored here —
    ///      they are read from the strategy at pay time so a single admin call on the Leaderboard
    ///      applies to all connected Markees simultaneously.
    /// @param _owner The initial owner (typically the buyer/creator)
    /// @param _pricingStrategy The strategy contract authorised to call mutations (typically a Leaderboard)
    /// @param _initialMessage The initial message to display
    /// @param _name The optional display name (max chars enforced by strategy)
    /// @param _historicalFunds Funds to credit from a prior deployment (0 for new Markees).
    ///        Only the strategy (admin-controlled) can call initialize, so this value cannot be
    ///        inflated by an external party. For migration via migrateFromLegacy() on Leaderboard,
    ///        the strategy reads the old clone's totalFundsAdded directly from on-chain state.
    function initialize(
        address _owner,
        address _pricingStrategy,
        string calldata _initialMessage,
        string calldata _name,
        uint256 _historicalFunds
    ) external {
        require(!initialized, "Already initialized");
        require(_owner != address(0), "Owner cannot be zero address");
        require(_pricingStrategy != address(0), "Strategy cannot be zero address");

        initialized = true;

        owner = _owner;
        pricingStrategy = _pricingStrategy;
        message = _initialMessage;
        name = _name;
        totalFundsAdded = _historicalFunds;

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
    ///      All five routing parameters are read dynamically from the strategy — including the RevNet
    ///      terminal and project ID — so admin only ever needs to update one place to apply changes
    ///      across every connected Markee (including the v5 → v6 terminal switch).
    /// @param tokenRecipient Address that should receive MARKEE tokens from the RevNet (when enabled)
    function pay(address tokenRecipient) external payable {
        require(initialized, "Not initialized");
        require(msg.sender == pricingStrategy, "Only pricing strategy can call pay");
        require(msg.value > 0, "Payment must be greater than zero");

        IPricingStrategy strategy = IPricingStrategy(pricingStrategy);
        address beneficiary = strategy.beneficiaryAddress();

        uint256 beneficiaryAmount;
        uint256 revNetAmount;

        if (!strategy.revNetEnabled() || beneficiary == address(0)) {
            beneficiaryAmount = msg.value;
        } else {
            beneficiaryAmount = (msg.value * strategy.percentToBeneficiary()) / BASIS_POINTS_DIVISOR;
            revNetAmount = msg.value - beneficiaryAmount;
        }

        if (beneficiary != address(0) && beneficiaryAmount > 0) {
            (bool success, ) = beneficiary.call{value: beneficiaryAmount}("");
            require(success, "Transfer to beneficiary failed");
        }

        (uint256 revNetBuyerAmount, uint256 revNetFeeReceiverAmount) =
            _routeRevNet(strategy, revNetAmount, tokenRecipient);

        totalFundsAdded += msg.value;

        emit PaymentReceived(msg.value, beneficiaryAmount, revNetBuyerAmount, revNetFeeReceiverAmount, tokenRecipient, totalFundsAdded);
    }

    function _routeRevNet(
        IPricingStrategy strategy,
        uint256 revNetAmount,
        address tokenRecipient
    ) internal returns (uint256 buyerAmount, uint256 feeAmount) {
        if (revNetAmount == 0) return (0, 0);

        address terminal = strategy.revNetTerminal();
        uint256 projectId = strategy.revNetProjectId();
        address feeReceiver = strategy.platformFeeReceiver();
        uint256 feePct = strategy.percentToPlatformFeeReceiver();

        if (feeReceiver == address(0) || feePct == 0) {
            buyerAmount = revNetAmount;
            IJBMultiTerminal(terminal).pay{value: buyerAmount}(
                projectId, NATIVE_TOKEN, buyerAmount, tokenRecipient, 0, "", ""
            );
        } else {
            feeAmount = (revNetAmount * feePct) / BASIS_POINTS_DIVISOR;
            buyerAmount = revNetAmount - feeAmount;
            if (feeAmount > 0) {
                IJBMultiTerminal(terminal).pay{value: feeAmount}(
                    projectId, NATIVE_TOKEN, feeAmount, feeReceiver, 0, "", ""
                );
            }
            if (buyerAmount > 0) {
                IJBMultiTerminal(terminal).pay{value: buyerAmount}(
                    projectId, NATIVE_TOKEN, buyerAmount, tokenRecipient, 0, "", ""
                );
            }
        }
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
    ///      the Leaderboard calls this, then removes the Markee from its registry.
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
