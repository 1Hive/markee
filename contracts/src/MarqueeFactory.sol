// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./Marquee.sol";
import "./DynamicPricingModule.sol";

contract MarqueeFactory is Ownable, ReentrancyGuard, Pausable {
    
    // Global message functionality
    string public globalMessage;
    bool public globalMessageActive;
    uint256 public globalMessagePrice;
    uint256 public globalMessageFund;
    
    // Factory settings
    uint256 public platformFeePercentage; // In basis points (100 = 1%)
    address public platformFeeRecipient;
    uint256 public defaultMaxMessageLength;
    DynamicPricingModule public defaultPricingModule;
    
    // Marquee tracking
    address[] public allMarquees;
    mapping(address => bool) public isValidMarquee;
    mapping(address => address[]) public userMarquees;
    
    // Global message tracking
    mapping(address => uint256) public globalMessageContributions;
    address[] public globalMessageContributors;
    
    // Events
    event MarqueeCreated(
        address indexed marquee,
        address indexed creator,
        address indexed beneficiary,
        string title,
        uint256 initialPrice
    );
    event GlobalMessageChanged(
        address indexed changer,
        string newMessage,
        uint256 amountPaid,
        uint256 newPrice
    );
    event GlobalMessageToggled(bool active);
    event PlatformFeeUpdated(uint256 newFee);
    event GlobalMessagePriceUpdated(uint256 newPrice);
    
    constructor(
        uint256 _platformFeePercentage,
        address _platformFeeRecipient,
        uint256 _defaultMaxMessageLength,
        string memory _initialGlobalMessage,
        uint256 _initialGlobalMessagePrice
    ) {
        require(_platformFeePercentage <= 1000, "Fee too high"); // Max 10%
        require(_platformFeeRecipient != address(0), "Invalid fee recipient");
        
        platformFeePercentage = _platformFeePercentage;
        platformFeeRecipient = _platformFeeRecipient;
        defaultMaxMessageLength = _defaultMaxMessageLength;
        globalMessage = _initialGlobalMessage;
        globalMessagePrice = _initialGlobalMessagePrice;
        globalMessageActive = false;
        
        // Deploy default pricing module
        defaultPricingModule = new DynamicPricingModule();
    }
    
    function createMarquee(
    string memory _title,
    string memory _description,
    string memory _initialMessage,
    address _beneficiary,
    uint256 _initialPrice,
    uint256 _maxMessageLength,
    bool _enableGlobalMessage,
    bool _useCustomPricing,
    uint256 _priceMultiplier,
    uint256 _decayRate
) external nonReentrant whenNotPaused returns (address) {
    require(bytes(_title).length > 0, "Title required");
    require(bytes(_initialMessage).length > 0, "Initial message required");
    require(_beneficiary != address(0), "Invalid beneficiary");
    require(_initialPrice > 0, "Initial price must be positive");
    require(_maxMessageLength > 0 && _maxMessageLength <= 10000, "Invalid message length");
    
    // Use provided max length or default
    uint256 maxLength = _maxMessageLength > 0 ? _maxMessageLength : defaultMaxMessageLength;
    
    // Deploy pricing module
    address pricingModule = _useCustomPricing ? 
        address(new DynamicPricingModule()) : 
        address(defaultPricingModule);
    
    // Deploy marquee contract
    Marquee newMarquee = new Marquee(
        _title,
        _description,
        _initialMessage,
        _beneficiary,
        pricingModule,
        _initialPrice,
        maxLength,
        _enableGlobalMessage
    );
    
    address marqueeAddress = address(newMarquee);
    
    // Handle custom pricing setup
    if (_useCustomPricing) {
        DynamicPricingModule customPricing = DynamicPricingModule(pricingModule);
        customPricing.authorizeMarquee(marqueeAddress);
        customPricing.transferOwnership(msg.sender);
        
        if (_priceMultiplier > 0 && _decayRate > 0) {
            customPricing.updatePricingConfig(marqueeAddress, _priceMultiplier, _decayRate);
        }
    } else {
        defaultPricingModule.authorizeMarquee(marqueeAddress);
    }
    
    // Transfer ownership and track marquee
    newMarquee.transferOwnership(msg.sender);
    allMarquees.push(marqueeAddress);
    isValidMarquee[marqueeAddress] = true;
    userMarquees[msg.sender].push(marqueeAddress);
    
    emit MarqueeCreated(marqueeAddress, msg.sender, _beneficiary, _title, _initialPrice);
    return marqueeAddress;
}
    
    // Global message functions
    function setGlobalMessage(string calldata _newMessage) external payable nonReentrant whenNotPaused {
        require(bytes(_newMessage).length > 0, "Message cannot be empty");
        require(bytes(_newMessage).length <= defaultMaxMessageLength, "Message too long");
        require(msg.value >= globalMessagePrice, "Insufficient payment");
        
        // Calculate platform fee
        uint256 platformFee = (msg.value * platformFeePercentage) / 10000;
        uint256 remainingAmount = msg.value - platformFee;
        
        // Update global message
        globalMessage = _newMessage;
        globalMessageFund += remainingAmount;
        
        // Track contributor
        if (globalMessageContributions[msg.sender] == 0) {
            globalMessageContributors.push(msg.sender);
        }
        globalMessageContributions[msg.sender] += msg.value;
        
        // Update price (10x increase)
        uint256 newPrice = globalMessagePrice * 10;
        globalMessagePrice = newPrice;
        
        // Send platform fee
        if (platformFee > 0) {
            (bool success, ) = platformFeeRecipient.call{value: platformFee}("");
            require(success, "Platform fee transfer failed");
        }
        
        emit GlobalMessageChanged(msg.sender, _newMessage, msg.value, newPrice);
    }
    
    function toggleGlobalMessage() external onlyOwner {
        globalMessageActive = !globalMessageActive;
        emit GlobalMessageToggled(globalMessageActive);
    }
    
    function setGlobalMessagePrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Price must be positive");
        globalMessagePrice = _newPrice;
        emit GlobalMessagePriceUpdated(_newPrice);
    }
    
    function getGlobalMessage() external view returns (string memory) {
        return globalMessage;
    }
    
    function isGlobalMessageActive() external view returns (bool) {
        return globalMessageActive;
    }
    
    // Platform functions
    function setPlatformFee(uint256 _newFeePercentage) external onlyOwner {
        require(_newFeePercentage <= 1000, "Fee too high"); // Max 10%
        platformFeePercentage = _newFeePercentage;
        emit PlatformFeeUpdated(_newFeePercentage);
    }
    
    function setPlatformFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Invalid recipient");
        platformFeeRecipient = _newRecipient;
    }
    
    function setDefaultMaxMessageLength(uint256 _newLength) external onlyOwner {
        require(_newLength > 0, "Length must be positive");
        defaultMaxMessageLength = _newLength;
    }
    
    function withdrawGlobalMessageFund() external onlyOwner {
        uint256 amount = globalMessageFund;
        require(amount > 0, "No funds to withdraw");
        
        globalMessageFund = 0;
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // View functions
    function getAllMarquees() external view returns (address[] memory) {
        return allMarquees;
    }
    
    function getUserMarquees(address _user) external view returns (address[] memory) {
        return userMarquees[_user];
    }
    
    function getMarqueeCount() external view returns (uint256) {
        return allMarquees.length;
    }
    
    function getMarqueesByRange(uint256 _start, uint256 _length) external view returns (address[] memory) {
        require(_start < allMarquees.length, "Start index out of bounds");
        
        uint256 end = _start + _length;
        if (end > allMarquees.length) {
            end = allMarquees.length;
        }
        
        address[] memory result = new address[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            result[i - _start] = allMarquees[i];
        }
        
        return result;
    }
    
    function getGlobalMessageStats() external view returns (
        string memory message,
        bool active,
        uint256 price,
        uint256 fund,
        uint256 contributorCount
    ) {
        return (
            globalMessage,
            globalMessageActive,
            globalMessagePrice,
            globalMessageFund,
            globalMessageContributors.length
        );
    }
    
    function getPlatformStats() external view returns (
        uint256 totalMarquees,
        uint256 feePercentage,
        address feeRecipient,
        uint256 maxMessageLength
    ) {
        return (
            allMarquees.length,
            platformFeePercentage,
            platformFeeRecipient,
            defaultMaxMessageLength
        );
    }
}
