// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./DynamicPricingModule.sol";
import "./IPricingModule.sol";

interface IMarqueeFactory {
    function getGlobalMessage() external view returns (string memory);
    function isGlobalMessageActive() external view returns (bool);
}

contract Marquee is Ownable, ReentrancyGuard, Pausable {
    
    // Events
    event MessageChanged(
        address indexed changer, 
        string newMessage, 
        uint256 amountPaid,
        uint256 newPrice,
        uint256 timestamp
    );
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event GlobalMessageToggled(bool enabled);
    event PricingModuleChanged(address indexed oldModule, address indexed newModule);
    event FundsWithdrawn(address indexed beneficiary, uint256 amount);
    
    // State variables
    string public message;
    string public title;
    string public description;
    address public beneficiary;
    address public factory;
    IPricingModule public pricingModule;
    bool public globalMessageEnabled;
    uint256 public maxMessageLength;
    
    // Analytics
    uint256 public totalFundsRaised;
    uint256 public totalMessageChanges;
    mapping(address => uint256) public userContributions;
    mapping(address => uint256) public userMessageChanges;
    address[] public contributors;
    
    // Message history
    struct MessageEvent {
        address changer;
        string message;
        uint256 amountPaid;
        uint256 timestamp;
    }
    MessageEvent[] public messageHistory;
    
    modifier onlyBeneficiaryOrOwner() {
        require(msg.sender == beneficiary || msg.sender == owner(), "Not authorized");
        _;
    }
    
    constructor(
        string memory _title,
        string memory _description,
        string memory _initialMessage,
        address _beneficiary,
        address _pricingModule,
        uint256 _initialPrice,
        uint256 _maxMessageLength,
        bool _globalMessageEnabled
    ) {
        title = _title;
        description = _description;
        message = _initialMessage;
        beneficiary = _beneficiary;
        factory = msg.sender;
        pricingModule = IPricingModule(_pricingModule);
        maxMessageLength = _maxMessageLength;
        globalMessageEnabled = _globalMessageEnabled;
        
        // Initialize pricing (factory is authorized to do this)
        pricingModule.initializePrice(address(this), _initialPrice);
        
        // Record initial message
        messageHistory.push(MessageEvent({
            changer: _beneficiary,
            message: _initialMessage,
            amountPaid: 0,
            timestamp: block.timestamp
        }));
    }
    
    function getCurrentPrice() external view returns (uint256) {
        return pricingModule.getCurrentPrice(address(this));
    }
    
    function getCurrentMessage() external view returns (string memory) {
        // Check if global message should override
        if (globalMessageEnabled) {
            IMarqueeFactory factoryContract = IMarqueeFactory(factory);
            if (factoryContract.isGlobalMessageActive()) {
                return factoryContract.getGlobalMessage();
            }
        }
        return message;
    }
    
    function setMessage(string calldata _newMessage) external payable nonReentrant whenNotPaused {
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        require(bytes(_newMessage).length > 0, "Message cannot be empty");
        
        uint256 requiredPayment = pricingModule.getCurrentPrice(address(this));
        require(msg.value >= requiredPayment, "Insufficient payment");
        
        // Update state
        message = _newMessage;
        totalFundsRaised += msg.value;
        totalMessageChanges++;
        
        // Track user analytics
        if (userContributions[msg.sender] == 0) {
            contributors.push(msg.sender);
        }
        userContributions[msg.sender] += msg.value;
        userMessageChanges[msg.sender]++;
        
        // Record message history
        messageHistory.push(MessageEvent({
            changer: msg.sender,
            message: _newMessage,
            amountPaid: msg.value,
            timestamp: block.timestamp
        }));
        
        // Update pricing for next change
        pricingModule.updatePrice(address(this), msg.value);
        
        // Send funds to beneficiary
        (bool success, ) = beneficiary.call{value: msg.value}("");
        require(success, "Transfer failed");
        
        emit MessageChanged(
            msg.sender, 
            _newMessage, 
            msg.value, 
            pricingModule.getCurrentPrice(address(this)),
            block.timestamp
        );
    }
    
    // Owner functions
    function setMessageAsOwner(string calldata _newMessage) external onlyOwner {
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        message = _newMessage;
        
        messageHistory.push(MessageEvent({
            changer: msg.sender,
            message: _newMessage,
            amountPaid: 0,
            timestamp: block.timestamp
        }));
        
        emit MessageChanged(msg.sender, _newMessage, 0, pricingModule.getCurrentPrice(address(this)), block.timestamp);
    }
    
    function setBeneficiary(address _newBeneficiary) external onlyBeneficiaryOrOwner {
        require(_newBeneficiary != address(0), "Invalid beneficiary");
        address oldBeneficiary = beneficiary;
        beneficiary = _newBeneficiary;
        emit BeneficiaryChanged(oldBeneficiary, _newBeneficiary);
    }
    
    function toggleGlobalMessage() external onlyBeneficiaryOrOwner {
        globalMessageEnabled = !globalMessageEnabled;
        emit GlobalMessageToggled(globalMessageEnabled);
    }
    
    function setPricingModule(address _newPricingModule) external onlyOwner {
        require(_newPricingModule != address(0), "Invalid pricing module");
        address oldModule = address(pricingModule);
        pricingModule = IPricingModule(_newPricingModule);
        emit PricingModuleChanged(oldModule, _newPricingModule);
    }
    
    function setMaxMessageLength(uint256 _newLength) external onlyOwner {
        require(_newLength > 0, "Length must be positive");
        maxMessageLength = _newLength;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // Emergency withdrawal (only owner)
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Transfer failed");
        
        emit FundsWithdrawn(owner(), balance);
    }
    
    // Analytics getters
    function getAnalytics() external view returns (
        uint256 _totalFundsRaised,
        uint256 _totalMessageChanges,
        uint256 _uniqueContributors,
        uint256 _averageContribution
    ) {
        _totalFundsRaised = totalFundsRaised;
        _totalMessageChanges = totalMessageChanges;
        _uniqueContributors = contributors.length;
        _averageContribution = _uniqueContributors > 0 ? _totalFundsRaised / _uniqueContributors : 0;
    }
    
    function getMessageHistory(uint256 _start, uint256 _length) external view returns (MessageEvent[] memory) {
        require(_start < messageHistory.length, "Start index out of bounds");
        
        uint256 end = _start + _length;
        if (end > messageHistory.length) {
            end = messageHistory.length;
        }
        
        MessageEvent[] memory result = new MessageEvent[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            result[i - _start] = messageHistory[i];
        }
        
        return result;
    }
    
    function getContributors() external view returns (address[] memory) {
        return contributors;
    }
    
    function getMessageHistoryLength() external view returns (uint256) {
        return messageHistory.length;
    }
}
