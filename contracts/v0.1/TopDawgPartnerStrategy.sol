// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title TopDawgPartnerStrategy
/// @notice Leaderboard where the highest-funded message holds the top spot.
///         Funds route to a partner beneficiaryAddress (100% during RevNet v5→v6 migration).
///         When RevNet v6 is live, admin restores the 62/38 split by calling
///         setPercentToBeneficiary(6200) + setRevNetEnabled(true).
/// @dev v1.0 architecture — on-chain markee registry, direct RPC (no subgraph).
contract TopDawgPartnerStrategy {
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    string public instanceName;
    string public partnerName;
    address public adminAddress;

    // Beneficiary routing (100% to partner while revNetEnabled = false)
    address public beneficiaryAddress;
    uint256 public percentToBeneficiary = 10000;
    bool public revNetEnabled = false;

    // RevNet config — populated by admin when v6 is live
    address public revNetTerminal;
    uint256 public revNetProjectId;

    uint256 public minimumPrice;
    uint256 public maxMessageLength;
    uint256 public maxNameLength;
    uint256 public totalInstanceFunds;

    // On-chain markee registry
    address[] public markees;
    mapping(address => uint256) private markeeIndex;
    mapping(address => bool) public isMarkeeUsingThisStrategy;

    bool public historyInitialized;

    event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name, uint256 amount, uint256 partnerAmount, uint256 revNetAmount);
    event FundsAddedToMarkee(address indexed markeeAddress, address indexed addedBy, uint256 amount, uint256 partnerAmount, uint256 revNetAmount, uint256 newMarkeeTotal, uint256 newInstanceTotal);
    event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage);
    event NameUpdated(address indexed markeeAddress, address indexed updatedBy, string newName);
    event PricingStrategyChangedForMarkee(address indexed markeeAddress, address indexed oldStrategy, address indexed newStrategy, address changedBy);
    event AdminAddressUpdated(address indexed oldAdmin, address indexed newAdmin);
    event BeneficiaryAddressUpdated(address indexed oldBeneficiary, address indexed newBeneficiary);
    event PercentToBeneficiaryUpdated(uint256 oldPercent, uint256 newPercent);
    event RevNetEnabledUpdated(bool enabled);
    event RevNetTerminalUpdated(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdUpdated(uint256 oldId, uint256 newId);
    event MinimumPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event MaxMessageLengthUpdated(uint256 oldLength, uint256 newLength);
    event MaxNameLengthUpdated(uint256 oldLength, uint256 newLength);
    event InstanceNameUpdated(string oldName, string newName);
    event HistoryInitialized(uint256 markeeCount, uint256 totalFunds);

    constructor(
        string memory _instanceName,
        string memory _partnerName,
        address _adminAddress,
        address _beneficiaryAddress,
        uint256 _minimumPrice,
        uint256 _maxMessageLength,
        uint256 _maxNameLength
    ) {
        require(_adminAddress != address(0), "Admin address cannot be zero address");
        require(bytes(_instanceName).length > 0, "Instance name cannot be empty");
        require(bytes(_partnerName).length > 0, "Partner name cannot be empty");
        require(_maxMessageLength > 0, "Max message length must be > 0");
        require(_maxNameLength > 0, "Max name length must be > 0");

        instanceName = _instanceName;
        partnerName = _partnerName;
        adminAddress = _adminAddress;
        beneficiaryAddress = _beneficiaryAddress;
        minimumPrice = _minimumPrice;
        maxMessageLength = _maxMessageLength;
        maxNameLength = _maxNameLength;
    }

    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "Only admin");
        _;
    }

    // ─── Payment routing ──────────────────────────────────────────────────────

    function _routePayment(uint256 _amount, address _payer)
        internal
        returns (uint256 partnerAmount, uint256 rvAmount)
    {
        if (!revNetEnabled || beneficiaryAddress == address(0)) {
            partnerAmount = _amount;
            rvAmount = 0;
        } else {
            partnerAmount = (_amount * percentToBeneficiary) / BASIS_POINTS_DIVISOR;
            rvAmount = _amount - partnerAmount;
        }

        if (beneficiaryAddress != address(0) && partnerAmount > 0) {
            (bool ok, ) = beneficiaryAddress.call{value: partnerAmount}("");
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

    // ─── Markee lifecycle ─────────────────────────────────────────────────────

    function createMarkee(string calldata _message, string calldata _name)
        external
        payable
        returns (address markeeAddress)
    {
        require(msg.value >= minimumPrice, "Below minimum price");
        require(bytes(_message).length <= maxMessageLength, "Message too long");
        require(bytes(_name).length <= maxNameLength, "Name too long");

        Markee markee = new Markee(
            msg.sender,
            address(this),
            _message,
            _name,
            msg.value
        );

        markeeAddress = address(markee);
        _addToRegistry(markeeAddress);
        totalInstanceFunds += msg.value;

        (uint256 pa, uint256 ra) = _routePayment(msg.value, msg.sender);

        emit MarkeeCreated(markeeAddress, msg.sender, _message, _name, msg.value, pa, ra);
    }

    function addFunds(address _markeeAddress) external payable {
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee not on this strategy");
        require(msg.value > 0, "Must send ETH");

        Markee markee = Markee(_markeeAddress);
        markee.addFunds(msg.value);
        totalInstanceFunds += msg.value;

        (uint256 pa, uint256 ra) = _routePayment(msg.value, msg.sender);

        emit FundsAddedToMarkee(_markeeAddress, msg.sender, msg.value, pa, ra, markee.totalFundsAdded(), totalInstanceFunds);
    }

    function updateMessage(address _markeeAddress, string calldata _newMessage) external {
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee not on this strategy");
        Markee markee = Markee(_markeeAddress);
        require(msg.sender == markee.owner(), "Only Markee owner");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        markee.setMessage(_newMessage);
        emit MessageUpdated(_markeeAddress, msg.sender, _newMessage);
    }

    function updateName(address _markeeAddress, string calldata _newName) external {
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee not on this strategy");
        Markee markee = Markee(_markeeAddress);
        require(msg.sender == markee.owner(), "Only Markee owner");
        require(bytes(_newName).length <= maxNameLength, "Name too long");
        markee.setName(_newName);
        emit NameUpdated(_markeeAddress, msg.sender, _newName);
    }

    function changePricingStrategy(address _markeeAddress, address _newStrategy) external onlyAdmin {
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee not on this strategy");
        _removeFromRegistry(_markeeAddress);
        Markee(_markeeAddress).setPricingStrategy(_newStrategy);
        emit PricingStrategyChangedForMarkee(_markeeAddress, address(this), _newStrategy, msg.sender);
    }

    function transferMarkeeOwnership(address _markeeAddress, address _newOwner) external {
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee not on this strategy");
        Markee markee = Markee(_markeeAddress);
        require(msg.sender == markee.owner(), "Only Markee owner");
        markee.transferOwnership(_newOwner);
    }

    // ─── Leaderboard queries ──────────────────────────────────────────────────

    function markeeCount() external view returns (uint256) {
        return markees.length;
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
            address ak = addrs[i];
            uint256 fk = funds[i];
            uint256 j = i;
            while (j > 0 && funds[j - 1] < fk) {
                funds[j] = funds[j - 1];
                addrs[j] = addrs[j - 1];
                j--;
            }
            funds[j] = fk;
            addrs[j] = ak;
        }

        topAddresses = new address[](limit);
        topFunds = new uint256[](limit);
        for (uint256 i = 0; i < limit; i++) {
            topAddresses[i] = addrs[i];
            topFunds[i] = funds[i];
        }
    }

    // ─── History seeding ──────────────────────────────────────────────────────

    /// @notice One-time call to register historical Markees and set accumulated total from prior deployment.
    function initializeHistory(address[] calldata _markees, uint256 _historicalTotal) external onlyAdmin {
        require(!historyInitialized, "History already initialized");
        historyInitialized = true;
        for (uint256 i = 0; i < _markees.length; i++) {
            address m = _markees[i];
            if (m != address(0) && !isMarkeeUsingThisStrategy[m]) {
                _addToRegistry(m);
            }
        }
        totalInstanceFunds += _historicalTotal;
        emit HistoryInitialized(_markees.length, _historicalTotal);
    }

    // ─── Admin setters ────────────────────────────────────────────────────────

    function setInstanceName(string calldata _newName) external onlyAdmin {
        require(bytes(_newName).length > 0, "Name cannot be empty");
        string memory old = instanceName;
        instanceName = _newName;
        emit InstanceNameUpdated(old, _newName);
    }

    function setAdminAddress(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        address old = adminAddress;
        adminAddress = _newAdmin;
        emit AdminAddressUpdated(old, _newAdmin);
    }

    function setBeneficiaryAddress(address _newBeneficiary) external onlyAdmin {
        address old = beneficiaryAddress;
        beneficiaryAddress = _newBeneficiary;
        emit BeneficiaryAddressUpdated(old, _newBeneficiary);
    }

    function setPercentToBeneficiary(uint256 _newPercent) external onlyAdmin {
        require(_newPercent <= BASIS_POINTS_DIVISOR, "Cannot exceed 100%");
        uint256 old = percentToBeneficiary;
        percentToBeneficiary = _newPercent;
        emit PercentToBeneficiaryUpdated(old, _newPercent);
    }

    function setRevNetEnabled(bool _enabled) external onlyAdmin {
        revNetEnabled = _enabled;
        emit RevNetEnabledUpdated(_enabled);
    }

    function setRevNetTerminal(address _terminal) external onlyAdmin {
        require(_terminal != address(0), "Terminal cannot be zero address");
        address old = revNetTerminal;
        revNetTerminal = _terminal;
        emit RevNetTerminalUpdated(old, _terminal);
    }

    function setRevNetProjectId(uint256 _projectId) external onlyAdmin {
        uint256 old = revNetProjectId;
        revNetProjectId = _projectId;
        emit RevNetProjectIdUpdated(old, _projectId);
    }

    function setMinimumPrice(uint256 _newPrice) external onlyAdmin {
        uint256 old = minimumPrice;
        minimumPrice = _newPrice;
        emit MinimumPriceUpdated(old, _newPrice);
    }

    function setMaxMessageLength(uint256 _newLength) external onlyAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxMessageLength;
        maxMessageLength = _newLength;
        emit MaxMessageLengthUpdated(old, _newLength);
    }

    function setMaxNameLength(uint256 _newLength) external onlyAdmin {
        require(_newLength > 0, "Must be > 0");
        uint256 old = maxNameLength;
        maxNameLength = _newLength;
        emit MaxNameLengthUpdated(old, _newLength);
    }

    // ─── Internal registry helpers ────────────────────────────────────────────

    function _addToRegistry(address markeeAddress) internal {
        markeeIndex[markeeAddress] = markees.length;
        markees.push(markeeAddress);
        isMarkeeUsingThisStrategy[markeeAddress] = true;
    }

    function _removeFromRegistry(address markeeAddress) internal {
        require(isMarkeeUsingThisStrategy[markeeAddress], "Not in registry");
        uint256 index = markeeIndex[markeeAddress];
        address last = markees[markees.length - 1];
        markees[index] = last;
        markeeIndex[last] = index;
        markees.pop();
        delete markeeIndex[markeeAddress];
        isMarkeeUsingThisStrategy[markeeAddress] = false;
    }
}
