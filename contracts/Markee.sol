// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @title Markee
/// @notice A simple contract that stores a message, tracks funds, and is controlled by a PricingStrategy
contract Markee {
    // State variables
    string public message;
    uint256 public totalFundsAdded;
    address public pricingStrategy;
    address public owner;
    
    // Events
    event MessageChanged(string newMessage, address indexed changedBy);
    event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy);
    event PricingStrategyChanged(address indexed oldStrategy, address indexed newStrategy);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    
    /// @notice Creates a new Markee
    /// @param _owner The owner of this Markee (can switch pricing strategies)
    /// @param _pricingStrategy The initial pricing strategy contract
    /// @param _initialMessage The initial message to display
    /// @param _initialFunds The initial amount of funds to record
    constructor(
        address _owner,
        address _pricingStrategy,
        string memory _initialMessage,
        uint256 _initialFunds
    ) {
        require(_owner != address(0), "Owner cannot be zero address");
        require(_pricingStrategy != address(0), "Strategy cannot be zero address");
        
        owner = _owner;
        pricingStrategy = _pricingStrategy;
        message = _initialMessage;
        totalFundsAdded = _initialFunds;
        
        emit MessageChanged(_initialMessage, _pricingStrategy);
        if (_initialFunds > 0) {
            emit FundsAdded(_initialFunds, _initialFunds, _pricingStrategy);
        }
    }
    
    /// @notice Updates the message (only callable by pricing strategy)
    /// @param _message The new message to display
    function setMessage(string calldata _message) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy contract can change message");
        message = _message;
        emit MessageChanged(_message, tx.origin);
    }
    
    /// @notice Adds funds to the total (only callable by pricing strategy)
    /// @param _amount The amount of funds to add
    function addFunds(uint256 _amount) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy contract can add funds");
        totalFundsAdded += _amount;
        emit FundsAdded(_amount, totalFundsAdded, tx.origin);
    }
    
    /// @notice Changes the pricing strategy (only callable by current strategy)
    /// @param _newStrategy The new pricing strategy contract address
    function setPricingStrategy(address _newStrategy) external {
        require(msg.sender == pricingStrategy, "Only current pricing strategy contract can change pricing strategy");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        
        address oldStrategy = pricingStrategy;
        pricingStrategy = _newStrategy;
        emit PricingStrategyChanged(oldStrategy, _newStrategy);
    }
    
    /// @notice Transfers ownership of the Markee (only callable by pricing strategy)
    /// @param _newOwner The new owner address
    function transferOwnership(address _newOwner) external {
        require(msg.sender == pricingStrategy, "Only pricing strategy contract can transfer owner");
        require(_newOwner != address(0), "Owner cannot be zero address");
        
        address oldOwner = owner;
        owner = _newOwner;
        emit OwnerChanged(oldOwner, _newOwner);
    }
}
