// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title TopDawgStrategy
/// @notice A pricing strategy where buyers choose their price for a Markee message, and the message with the most funds added is the Top Dawg.
/// @dev Each Top Dawg deployment creates an independent leaderboard with its own admin and settings
/// @dev All instances deployed on Base (canonical chain)
contract TopDawgStrategy {
    // Constants
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    uint256 public constant BASIS_POINTS_DIVISOR = 10000; // 10000 = 100%
    
    // Configuration
    address public immutable revNetTerminal;
    uint256 public immutable revNetProjectId;
    string public instanceName;  // Identifies this specific instance (e.g., "Markee Top Dawg", "Gardens Top Dawg")
    address public adminAddress;
    address public beneficiaryAddress;
    uint256 public percentToBeneficiary; // In basis points (6200 = 62%)
    uint256 public minimumPrice;
    uint256 public maxMessageLength;
    uint256 public maxNameLength;
    
    // Total funds that have flowed through this strategy instance
    uint256 public totalInstanceFunds;
    
    // Mapping to track which Markees are using this strategy
    mapping(address => bool) public isMarkeeUsingThisStrategy;
    
    // Events
    event MarkeeCreated(
        address indexed markeeAddress,
        address indexed owner,
        string message,
        string name,
        uint256 amount,
        uint256 beneficiaryAmount,
        uint256 revNetAmount
    );
    event MessageUpdated(
        address indexed markeeAddress,
        address indexed updatedBy,
        string newMessage
    );
    event NameUpdated(
        address indexed markeeAddress,
        address indexed updatedBy,
        string newName
    );
    event FundsAddedToMarkee(
        address indexed markeeAddress,
        address indexed addedBy,
        uint256 amount,
        uint256 beneficiaryAmount,
        uint256 revNetAmount,
        uint256 newMarkeeTotal,
        uint256 newInstanceTotal
    );
    event PricingStrategyChangedForMarkee(
        address indexed markeeAddress,
        address indexed oldStrategy,
        address indexed newStrategy,
        address changedBy
    );
    event AdminAddressUpdated(address indexed oldAdmin, address indexed newAdmin);
    event BeneficiaryAddressUpdated(address indexed oldBeneficiary, address indexed newBeneficiary);
    event PercentToBeneficiaryUpdated(uint256 oldPercent, uint256 newPercent);
    event MinimumPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event MaxMessageLengthUpdated(uint256 oldLength, uint256 newLength);
    event MaxNameLengthUpdated(uint256 oldLength, uint256 newLength);
    event InstanceNameUpdated(string oldName, string newName);
    
    /// @notice Creates a new TopDawgStrategy
    /// @param _revNetTerminal Address of the Juicebox terminal for RevNet payments
    /// @param _revNetProjectId The RevNet project ID for Markee
    /// @param _instanceName Name identifying this specific instance (e.g., "Markee Top Dawg", "Gardens Top Dawg")
    /// @param _adminAddress Address of the admin (typically a multisig)
    /// @param _beneficiaryAddress Address to receive percentage of funds (can be address(0) to disable)
    /// @param _minimumPrice The minimum price to create a Markee
    /// @param _maxMessageLength The maximum message length
    /// @param _maxNameLength The maximum name length
    constructor(
        address _revNetTerminal,
        uint256 _revNetProjectId,
        string memory _instanceName,
        address _adminAddress,
        address _beneficiaryAddress,
        uint256 _minimumPrice,
        uint256 _maxMessageLength,
        uint256 _maxNameLength
    ) {
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");
        require(_adminAddress != address(0), "Admin address cannot be zero address");
        require(bytes(_instanceName).length > 0, "Instance name cannot be empty");
        require(_maxMessageLength > 0, "Maximum message length must be greater than zero");
        require(_maxNameLength > 0, "Maximum name length must be greater than zero");
        
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        instanceName = _instanceName;
        adminAddress = _adminAddress;
        beneficiaryAddress = _beneficiaryAddress;
        percentToBeneficiary = 6200; // 62% in basis points
        minimumPrice = _minimumPrice;
        maxMessageLength = _maxMessageLength;
        maxNameLength = _maxNameLength;
        totalInstanceFunds = 0;
    }
    
    /// @notice Modifier to restrict functions to admin only
    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "Only admin address can perform this action");
        _;
    }
    
    /// @notice Internal function to split and distribute funds
    /// @param _fullAmount The total amount to split
    /// @param _payer The address that should receive MARKEE tokens
    /// @return beneficiaryAmount Amount sent to beneficiary
    /// @return revNetAmount Amount sent to RevNet
    function _splitAndDistributeFunds(uint256 _fullAmount, address _payer) 
        internal 
        returns (uint256 beneficiaryAmount, uint256 revNetAmount) 
    {
        // Calculate beneficiary share
        beneficiaryAmount = (_fullAmount * percentToBeneficiary) / BASIS_POINTS_DIVISOR;
        
        // Remainder goes to RevNet
        revNetAmount = _fullAmount - beneficiaryAmount;
        
        // Send to beneficiary if address is set and amount > 0
        if (beneficiaryAddress != address(0) && beneficiaryAmount > 0) {
            (bool success, ) = beneficiaryAddress.call{value: beneficiaryAmount}("");
            require(success, "Transfer to beneficiary failed");
        }
        
        // Send to RevNet (tokens go to payer)
        if (revNetAmount > 0) {
            IJBMultiTerminal(revNetTerminal).pay{value: revNetAmount}(
                revNetProjectId,
                NATIVE_TOKEN,
                revNetAmount,
                _payer,               // payer receives MARKEE tokens
                0,                    // minReturnedTokens
                "",                   // memo
                ""                    // metadata
            );
        }
        
        return (beneficiaryAmount, revNetAmount);
    }
    
    /// @notice Creates a new Markee and forwards payment to beneficiary and RevNet
    /// @param _message The initial message for the Markee
    /// @param _name The optional name for the Markee creator (can be empty string)
    /// @return markeeAddress The address of the newly created Markee
    function createMarkee(string calldata _message, string calldata _name) 
        external 
        payable 
        returns (address markeeAddress) 
    {
        // Check minimum price
        require(msg.value >= minimumPrice, "Payment amount is below minimum price requirement");
        
        // Check message length
        require(bytes(_message).length <= maxMessageLength, "Message exceeds maximum length");
        
        // Check name length
        require(bytes(_name).length <= maxNameLength, "Name exceeds maximum length");
        
        // Deploy new Markee contract with full amount
        Markee markee = new Markee(
            msg.sender,           // owner = the payer
            address(this),        // pricingStrategy = this contract
            _message,             // initial message
            _name,                // name (can be empty)
            msg.value             // initial funds (full amount)
        );
        
        markeeAddress = address(markee);
        
        // Track that this Markee is using this strategy
        isMarkeeUsingThisStrategy[markeeAddress] = true;
        
        // Update total instance funds with full amount
        totalInstanceFunds += msg.value;
        
        // Split and distribute funds
        (uint256 beneficiaryAmount, uint256 revNetAmount) = _splitAndDistributeFunds(msg.value, msg.sender);
        
        emit MarkeeCreated(
            markeeAddress, 
            msg.sender, 
            _message, 
            _name, 
            msg.value,
            beneficiaryAmount,
            revNetAmount
        );
    }
    
    /// @notice Allows the Markee owner to update their message for free
    /// @param _markeeAddress The address of the Markee to update
    /// @param _newMessage The new message
    function updateMessage(address _markeeAddress, string calldata _newMessage) 
        external 
    {
        Markee markee = Markee(_markeeAddress);
        
        // Verify this Markee is using this strategy
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee is not using this pricing strategy");
        
        // Verify caller is the owner
        require(msg.sender == markee.owner(), "Only Markee owner can update message");
        
        // Check message length
        require(bytes(_newMessage).length <= maxMessageLength, "Message exceeds maximum length");
        
        // Update the message
        markee.setMessage(_newMessage);
        
        emit MessageUpdated(_markeeAddress, msg.sender, _newMessage);
    }
    
    /// @notice Allows the Markee owner to update their name for free
    /// @param _markeeAddress The address of the Markee to update
    /// @param _newName The new name
    function updateName(address _markeeAddress, string calldata _newName) 
        external 
    {
        Markee markee = Markee(_markeeAddress);
        
        // Verify this Markee is using this strategy
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee is not using this pricing strategy");
        
        // Verify caller is the owner
        require(msg.sender == markee.owner(), "Only Markee owner can update name");
        
        // Check name length
        require(bytes(_newName).length <= maxNameLength, "Name exceeds maximum length");
        
        // Update the name
        markee.setName(_newName);
        
        emit NameUpdated(_markeeAddress, msg.sender, _newName);
    }
    
    /// @notice Allows anyone to add funds to increase a Markee's leaderboard position
    /// @param _markeeAddress The address of the Markee to add funds to
    function addFunds(address _markeeAddress) 
        external 
        payable 
    {
        Markee markee = Markee(_markeeAddress);
        
        // Verify this Markee is using this strategy
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee is not using this pricing strategy");
        
        // Verify non-zero amount
        require(msg.value > 0, "Must send ETH to add funds");
        
        // Update the Markee's total with full amount
        markee.addFunds(msg.value);
        
        // Update total instance funds with full amount
        totalInstanceFunds += msg.value;
        
        // Split and distribute funds
        (uint256 beneficiaryAmount, uint256 revNetAmount) = _splitAndDistributeFunds(msg.value, msg.sender);
        
        emit FundsAddedToMarkee(
            _markeeAddress, 
            msg.sender, 
            msg.value,
            beneficiaryAmount,
            revNetAmount,
            markee.totalFundsAdded(),
            totalInstanceFunds
        );
    }

    
    /// @notice Allows admin to change a Markee's pricing strategy
    /// @param _markeeAddress The address of the Markee
    /// @param _newStrategy The new pricing strategy contract
    function changePricingStrategy(address _markeeAddress, address _newStrategy) 
        external 
        onlyAdmin
    {
        // Verify this Markee is currently using this strategy
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee is not using this pricing strategy");
        
        Markee markee = Markee(_markeeAddress);
        
        // Remove from our tracking since it's switching away
        isMarkeeUsingThisStrategy[_markeeAddress] = false;
        
        // Change the strategy on the Markee
        markee.setPricingStrategy(_newStrategy);
        
        emit PricingStrategyChangedForMarkee(
            _markeeAddress, 
            address(this), 
            _newStrategy, 
            msg.sender
        );
    }
    
    /// @notice Allows the Markee owner to transfer message-editing privileges
    /// @param _markeeAddress The address of the Markee
    /// @param _newOwner The new owner address
    function transferMarkeeOwnership(address _markeeAddress, address _newOwner) 
        external 
    {
        Markee markee = Markee(_markeeAddress);
        
        // Verify this Markee is using this strategy
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee is not using this pricing strategy");
        
        // Verify caller is the current owner
        require(msg.sender == markee.owner(), "Only Markee owner can transfer ownership");
        
        // Transfer ownership
        markee.transferOwnership(_newOwner);
    }
    
    /// @notice Allows admin to update the instance name
    /// @param _newName The new instance name
    function setInstanceName(string calldata _newName) external onlyAdmin {
        require(bytes(_newName).length > 0, "Instance name cannot be empty");
        string memory oldName = instanceName;
        instanceName = _newName;
        emit InstanceNameUpdated(oldName, _newName);
    }
    
    /// @notice Allows admin to update the admin address
    /// @param _newAdmin The new admin address
    function setAdminAddress(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Admin address cannot be zero address");
        address oldAdmin = adminAddress;
        adminAddress = _newAdmin;
        emit AdminAddressUpdated(oldAdmin, _newAdmin);
    }
    
    /// @notice Allows admin to update the beneficiary address
    /// @param _newBeneficiary The new beneficiary address (can be address(0) to disable)
    function setBeneficiaryAddress(address _newBeneficiary) external onlyAdmin {
        address oldBeneficiary = beneficiaryAddress;
        beneficiaryAddress = _newBeneficiary;
        emit BeneficiaryAddressUpdated(oldBeneficiary, _newBeneficiary);
    }
    
    /// @notice Allows admin to update the percentage to beneficiary
    /// @param _newPercent The new percentage in basis points (10000 = 100%)
    function setPercentToBeneficiary(uint256 _newPercent) external onlyAdmin {
        require(_newPercent <= BASIS_POINTS_DIVISOR, "Percent cannot exceed 100%");
        uint256 oldPercent = percentToBeneficiary;
        percentToBeneficiary = _newPercent;
        emit PercentToBeneficiaryUpdated(oldPercent, _newPercent);
    }
    
    /// @notice Allows admin to update the minimum price
    /// @param _newMinimumPrice The new minimum price in wei
    function setMinimumPrice(uint256 _newMinimumPrice) external onlyAdmin {
        uint256 oldPrice = minimumPrice;
        minimumPrice = _newMinimumPrice;
        emit MinimumPriceUpdated(oldPrice, _newMinimumPrice);
    }
    
    /// @notice Allows admin to update the maximum message length
    /// @param _newMaxLength The new maximum length in characters
    function setMaxMessageLength(uint256 _newMaxLength) external onlyAdmin {
        require(_newMaxLength > 0, "Maximum message length must be greater than zero");
        uint256 oldLength = maxMessageLength;
        maxMessageLength = _newMaxLength;
        emit MaxMessageLengthUpdated(oldLength, _newMaxLength);
    }
    
    /// @notice Allows admin to update the maximum name length
    /// @param _newMaxLength The new maximum length in characters
    function setMaxNameLength(uint256 _newMaxLength) external onlyAdmin {
        require(_newMaxLength > 0, "Maximum name length must be greater than zero");
        uint256 oldLength = maxNameLength;
        maxNameLength = _newMaxLength;
        emit MaxNameLengthUpdated(oldLength, _newMaxLength);
    }
}
