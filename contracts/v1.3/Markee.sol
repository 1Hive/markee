// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Interfaces.sol";

/// @title Markee v1.3
/// @notice A message board contract that stores a message and name, tracks total funds,
///         and routes payments to a community beneficiary and the Markee Cooperative RevNet.
///
/// @dev Payment routing is handled within this contract. The pricing strategy determines
///      *whether* a payment is valid and calls pay(), but cannot alter where funds go
///      without being explicitly set as the pricingStrategy by the current strategy (admin-gated).
///
/// @dev All seven routing parameters are read dynamically from the pricingStrategy at pay time.
///      In v1.3 the pricingStrategy (Leaderboard) proxies all RevNet and fee config values to
///      the factory, so a single factory admin call (Coop multisig) updates routing for every
///      connected Markee across the entire factory simultaneously.
///
/// @dev Deployed as a minimal proxy clone by Leaderboard (EIP-1167). Do not deploy directly.
/// @dev All instances deployed on Base (canonical chain).
contract Markee {

    string public constant VERSION = "1.3.0";
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    bool public initialized;

    string public message;
    string public name;

    /// @notice Cumulative ETH (in wei) ever credited to this Markee.
    /// @dev Used as the leaderboard ranking metric. Cannot be incremented except through pay().
    uint256 public totalFundsAdded;

    /// @notice The pricing strategy contract authorised to call mutations on this Markee.
    /// @dev Always a Leaderboard contract. Can be changed by the current strategy via setPricingStrategy().
    address public pricingStrategy;

    /// @notice The owner of this Markee — entitled to free message and name edits via the strategy.
    address public owner;

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

    // ─── Initializer ──────────────────────────────────────────────────────────

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

    // ─── Payment ──────────────────────────────────────────────────────────────

    /// @notice Accepts ETH, splits it between the community beneficiary and the Markee Cooperative
    ///         RevNet, and records the full amount against totalFundsAdded.
    /// @dev Only callable by pricingStrategy. All routing parameters are read dynamically from
    ///      the strategy — which in v1.3 proxies RevNet and fee config from the factory — so a
    ///      single factory admin call applies changes across every connected Markee instantly.
    /// @param tokenRecipient Address that receives MARKEE tokens from the RevNet (when enabled).
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

    // ─── Message & name setters ───────────────────────────────────────────────

    function setMessage(string calldata _message) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy can set message");
        message = _message;
        emit MessageChanged(_message, msg.sender);
    }

    function setName(string calldata _name) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy can set name");
        name = _name;
        emit NameChanged(_name, msg.sender);
    }

    // ─── Strategy & ownership ─────────────────────────────────────────────────

    /// @notice Switches the pricing strategy for this Markee.
    /// @dev Only callable by the current pricingStrategy. Used when a Markee migrates leaderboards.
    function setPricingStrategy(address _newStrategy) external {
        require(msg.sender == pricingStrategy, "Only current pricing strategy can change strategy");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        address old = pricingStrategy;
        pricingStrategy = _newStrategy;
        emit PricingStrategyChanged(old, _newStrategy);
    }

    /// @notice Transfers Markee ownership (free edit rights) to a new address.
    /// @dev Only callable by pricingStrategy. The strategy verifies the caller is the current owner.
    function transferOwnership(address _newOwner) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy can transfer ownership");
        require(_newOwner != address(0), "Owner cannot be zero address");
        address old = owner;
        owner = _newOwner;
        emit OwnerChanged(old, _newOwner);
    }
}
