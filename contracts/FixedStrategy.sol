// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title FixedStrategy
/// @notice A pricing strategy where anyone can pay a fixed price to change the message
/// @dev Typically deployed once per Markee for custom use cases
contract FixedStrategy {
    // Constants
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    
    // Configuration
    address public immutable revNetTerminal;
    uint256 public immutable revNetProjectId;
    address public immutable markeeAddress;
    address public owner;
    uint256 public price;
    uint256 public maxMessageLength;
    
    // Events
    event MessageChanged(
        address indexed changedBy,
        string newMessage,
        uint256 pricePaid
    );
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event MaxMessageLengthUpdated(uint256 oldLength, uint256 newLength);
    event PricingStrategyChanged(address indexed newStrategy);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    /// @notice Creates a new FixedStrategy and its associated Markee
    /// @param _revNetTerminal Address of the Juicebox terminal for RevNet payments
    /// @param _revNetProjectId The RevNet project ID for Markee
    /// @param _initialMessage The initial message for the Markee
    /// @param _price The fixed price (in wei) anyone must pay to change the message
    /// @param _maxMessageLength The maximum message length
    constructor(
        address _revNetTerminal,
        uint256 _revNetProjectId,
        string memory _initialMessage,
        uint256 _price,
        uint256 _maxMessageLength
    ) {
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");
        require(_price > 0, "Price must be greater than zero");
        require(_maxMessageLength > 0, "Maximum message length must be greater than zero");
        require(bytes(_initialMessage).length <= _maxMessageLength, "Message exceeds maximum length");
        
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        owner = msg.sender;
        price = _price;
        maxMessageLength = _maxMessageLength;
        
        // Deploy the Markee contract
        Markee markee = new Markee(
            msg.sender,           // owner = the deployer
            address(this),        // pricingStrategy = this contract
            _initialMessage,      // initial message
            0                     // no initial funds
        );
        
        markeeAddress = address(markee);
    }
    
    /// @notice Allows anyone to pay the fixed price to change the message
    /// @param _newMessage The new message to set
    function changeMessage(string calldata _newMessage) 
        external 
        payable 
    {
        // Check payment amount
        require(msg.value == price, "Payment amount must equal the fixed price");
        
        // Check message length
        require(bytes(_newMessage).length <= maxMessageLength, "Message exceeds maximum length");
        
        // Get reference to the Markee
        Markee markee = Markee(markeeAddress);
        
        // Update the message
        markee.setMessage(_newMessage);
        
        // Add funds to the Markee's total
        markee.addFunds(msg.value);
        
        // Forward payment to RevNet (tokens go to payer)
        IJBMultiTerminal(revNetTerminal).pay{value: msg.value}(
            revNetProjectId,
            NATIVE_TOKEN,
            msg.value,
            msg.sender,           // payer receives tABC tokens
            0,                    // minReturnedTokens
            "",                   // memo
            ""                    // metadata
        );
        
        emit MessageChanged(msg.sender, _newMessage, msg.value);
    }
    
    /// @notice Allows the owner to update the fixed price
    /// @param _newPrice The new price in wei
    function setPrice(uint256 _newPrice) external {
        require(msg.sender == owner, "Only owner can set price");
        require(_newPrice > 0, "Price must be greater than zero");
        
        uint256 oldPrice = price;
        price = _newPrice;
        
        emit PriceUpdated(oldPrice, _newPrice);
    }
    
    /// @notice Allows the owner to update the maximum message length
    /// @param _newMaxLength The new maximum length in characters
    function setMaxMessageLength(uint256 _newMaxLength) external {
        require(msg.sender == owner, "Only owner can set maximum message length");
        require(_newMaxLength > 0, "Maximum message length must be greater than zero");
        
        uint256 oldLength = maxMessageLength;
        maxMessageLength = _newMaxLength;
        
        emit MaxMessageLengthUpdated(oldLength, _newMaxLength);
    }
    
    /// @notice Allows the owner to change the pricing strategy
    /// @param _newStrategy The new pricing strategy contract
    function changePricingStrategy(address _newStrategy) external {
        require(msg.sender == owner, "Only owner can change pricing strategy");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        
        Markee markee = Markee(markeeAddress);
        markee.setPricingStrategy(_newStrategy);
        
        emit PricingStrategyChanged(_newStrategy);
    }
    
    /// @notice Allows the owner to transfer ownership of the FixedStrategy
    /// @param _newOwner The new owner address
    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "Only owner can transfer ownership");
        require(_newOwner != address(0), "New owner cannot be zero address");
        
        address previousOwner = owner;
        owner = _newOwner;
        
        emit OwnershipTransferred(previousOwner, _newOwner);
    }
}
