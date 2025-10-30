// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "./Markee.sol";
import "./Interfaces.sol";

/// @title InvestorStrategy
/// @notice A pricing strategy where paying creates a new Markee owned by the payer
/// @dev Owned by admin multisig who can change pricing strategies for any Markee using this contract
contract InvestorStrategy {
    // Constants
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    
    // Configuration
    address public immutable revNetTerminal;
    uint256 public immutable revNetProjectId;
    address public adminAddress;
    uint256 public minimumPrice;
    uint256 public maxMessageLength;
    
    // Mapping to track which Markees are using this strategy
    mapping(address => bool) public isMarkeeUsingThisStrategy;
    
    // Events
    event MarkeeCreated(
        address indexed markeeAddress,
        address indexed owner,
        string message,
        uint256 amount
    );
    event MessageUpdated(
        address indexed markeeAddress,
        address indexed updatedBy,
        string newMessage
    );
    event FundsAddedToMarkee(
        address indexed markeeAddress,
        address indexed addedBy,
        uint256 amount,
        uint256 newTotal
    );
    event PricingStrategyChangedForMarkee(
        address indexed markeeAddress,
        address indexed oldStrategy,
        address indexed newStrategy,
        address changedBy
    );
    event AdminAddressUpdated(address indexed oldAdmin, address indexed newAdmin);
    event MinimumPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event MaxMessageLengthUpdated(uint256 oldLength, uint256 newLength);
    
    /// @notice Creates a new InvestorStrategy
    /// @param _revNetTerminal Address of the Juicebox terminal for RevNet payments
    /// @param _revNetProjectId The RevNet project ID for Markee
    /// @param _adminAddress Address of the admin
    /// @param _minimumPrice The minimum price to create a Markee
    /// @param _maxMessageLength The maximum message length
    constructor(
        address _revNetTerminal,
        uint256 _revNetProjectId,
        address _adminAddress,
        uint256 _minimumPrice,
        uint256 _maxMessageLength
    ) {
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");
        require(_adminAddress != address(0), "Admin address cannot be zero address");
        require(_maxMessageLength > 0, "Maximum message length must be greater than zero");
        
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        adminAddress = _adminAddress;
        minimumPrice = _minimumPrice;
        maxMessageLength = _maxMessageLength;
    }
    
    /// @notice Modifier to restrict functions to admin only
    modifier onlyAdmin() {
        require(msg.sender == adminAddress, "Only admin address can perform this action");
        _;
    }
    
    /// @notice Creates a new Markee and forwards payment to RevNet
    /// @param _message The initial message for the Markee
    /// @return markeeAddress The address of the newly created Markee
    function createMarkee(string calldata _message) 
        external 
        payable 
        returns (address markeeAddress) 
    {
        // Check minimum price
        require(msg.value >= minimumPrice, "Payment amount is below minimum price requirement");
        
        // Check message length
        require(bytes(_message).length <= maxMessageLength, "Message exceeds maximum length");
        
        // Deploy new Markee contract
        Markee markee = new Markee(
            msg.sender,           // owner = the payer
            address(this),        // pricingStrategy = this contract
            _message,             // initial message
            msg.value             // initial funds
        );
        
        markeeAddress = address(markee);
        
        // Track that this Markee is using this strategy
        isMarkeeUsingThisStrategy[markeeAddress] = true;
        
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
        
        emit MarkeeCreated(markeeAddress, msg.sender, _message, msg.value);
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
    
    /// @notice Allows the Markee owner to add more funds to increase their leaderboard position
    /// @param _markeeAddress The address of the Markee to add funds to
    function addFunds(address _markeeAddress) 
        external 
        payable 
    {
        Markee markee = Markee(_markeeAddress);
        
        // Verify this Markee is using this strategy
        require(isMarkeeUsingThisStrategy[_markeeAddress], "Markee is not using this pricing strategy");
        
        // Verify caller is the owner
        require(msg.sender == markee.owner(), "Only Markee owner can add funds");
        
        // Verify non-zero amount
        require(msg.value > 0, "Must send ETH to add funds");
        
        // Update the Markee's total
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
        
        emit FundsAddedToMarkee(_markeeAddress, msg.sender, msg.value, markee.totalFundsAdded());
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
    
    /// @notice Allows admin to update the admin address
    /// @param _newAdmin The new admin address
    function setAdminAddress(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Admin address cannot be zero address");
        address oldAdmin = adminAddress;
        adminAddress = _newAdmin;
        emit AdminAddressUpdated(oldAdmin, _newAdmin);
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
}
