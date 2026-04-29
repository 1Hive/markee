// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title FixedPriceStrategy
/// @notice Anyone pays the fixed price to change the message.
///         All funds route to beneficiaryAddress during the RevNet v5→v6 migration.
///         Admin re-enables RevNet routing once v6 is live.
/// @dev v1.0 architecture — direct RPC (no subgraph).
contract FixedPriceStrategy {
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public immutable markeeAddress;
    address public owner;

    // Beneficiary routing (100% to beneficiary while revNetEnabled = false)
    address public beneficiaryAddress;
    uint256 public percentToBeneficiary = 10000;
    bool public revNetEnabled = false;

    // RevNet config — populated by admin when v6 is live
    address public revNetTerminal;
    uint256 public revNetProjectId;

    uint256 public price;
    uint256 public maxMessageLength;
    uint256 public maxNameLength;
    uint256 public totalFundsRaised;

    bool public historyInitialized;

    event MessageChanged(address indexed changedBy, string newMessage, string name, uint256 pricePaid);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BeneficiaryAddressUpdated(address indexed oldBeneficiary, address indexed newBeneficiary);
    event PercentToBeneficiaryUpdated(uint256 oldPercent, uint256 newPercent);
    event RevNetEnabledUpdated(bool enabled);
    event RevNetTerminalUpdated(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdUpdated(uint256 oldId, uint256 newId);
    event MaxMessageLengthUpdated(uint256 oldLength, uint256 newLength);
    event MaxNameLengthUpdated(uint256 oldLength, uint256 newLength);
    event PricingStrategyChanged(address indexed newStrategy);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event HistoryInitialized(uint256 historicalTotal);

    constructor(
        string memory _initialMessage,
        string memory _initialName,
        address _beneficiaryAddress,
        uint256 _price,
        uint256 _maxMessageLength,
        uint256 _maxNameLength
    ) {
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

        Markee markee = new Markee(
            msg.sender,
            address(this),
            _initialMessage,
            _initialName,
            0
        );

        markeeAddress = address(markee);
    }

    // ─── Payment routing ──────────────────────────────────────────────────────

    function _routePayment(uint256 _amount, address _payer) internal {
        uint256 beneficiaryAmount;
        uint256 rvAmount;

        if (!revNetEnabled || beneficiaryAddress == address(0)) {
            beneficiaryAmount = _amount;
            rvAmount = 0;
        } else {
            beneficiaryAmount = (_amount * percentToBeneficiary) / BASIS_POINTS_DIVISOR;
            rvAmount = _amount - beneficiaryAmount;
        }

        if (beneficiaryAddress != address(0) && beneficiaryAmount > 0) {
            (bool ok, ) = beneficiaryAddress.call{value: beneficiaryAmount}("");
            require(ok, "Transfer to beneficiary failed");
        }

        if (rvAmount > 0) {
            IJBMultiTerminal(revNetTerminal).pay{value: rvAmount}(
                revNetProjectId,
                NATIVE_TOKEN,
                rvAmount,
                _payer,
                0,
                "",
                ""
            );
        }
    }

    // ─── Core action ─────────────────────────────────────────────────────────

    function changeMessage(string calldata _newMessage, string calldata _name) external payable {
        require(msg.value == price, "Payment must equal fixed price");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        if (bytes(_name).length > 0) {
            require(bytes(_name).length <= maxNameLength, "Name too long");
        }

        Markee markee = Markee(markeeAddress);
        markee.setMessage(_newMessage);
        markee.setName(_name);
        markee.addFunds(msg.value);
        totalFundsRaised += msg.value;

        _routePayment(msg.value, msg.sender);

        emit MessageChanged(msg.sender, _newMessage, _name, msg.value);
    }

    /// @notice Owner-only free message update (for cross-chain or admin use)
    function updateMessage(string calldata _newMessage, string calldata _name) external {
        require(msg.sender == owner, "Only owner");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        if (bytes(_name).length > 0) {
            require(bytes(_name).length <= maxNameLength, "Name too long");
        }
        Markee markee = Markee(markeeAddress);
        markee.setMessage(_newMessage);
        markee.setName(_name);
        emit MessageChanged(owner, _newMessage, _name, 0);
    }

    // ─── History seeding ──────────────────────────────────────────────────────

    /// @notice One-time call to set accumulated total from prior deployment.
    function initializeHistory(uint256 _historicalTotal) external {
        require(msg.sender == owner, "Only owner");
        require(!historyInitialized, "History already initialized");
        historyInitialized = true;
        totalFundsRaised += _historicalTotal;
        emit HistoryInitialized(_historicalTotal);
    }

    // ─── Admin/owner setters ──────────────────────────────────────────────────

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
        require(_newPercent <= BASIS_POINTS_DIVISOR, "Cannot exceed 100%");
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

    function changePricingStrategy(address _newStrategy) external {
        require(msg.sender == owner, "Only owner");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        Markee(markeeAddress).setPricingStrategy(_newStrategy);
        emit PricingStrategyChanged(_newStrategy);
    }

    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "Only owner");
        require(_newOwner != address(0), "New owner cannot be zero address");
        address old = owner;
        owner = _newOwner;
        emit OwnershipTransferred(old, _newOwner);
    }
}
