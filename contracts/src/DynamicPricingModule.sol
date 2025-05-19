// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPricingModule.sol"; 

contract DynamicPricingModule is IPricingModule, Ownable {
    
    struct PricingConfig {
        uint256 basePrice;          // Initial price
        uint256 currentPrice;       // Current price to change message
        uint256 lastUpdateTime;     // When price was last updated
        uint256 priceMultiplier;    // Price increases by this factor (in basis points)
        uint256 decayRate;          // Price decreases by this factor per hour (in basis points)
        bool initialized;
    }
    
    // Default values
    uint256 public constant DEFAULT_PRICE_MULTIPLIER = 100000; // 10x increase
    uint256 public constant DEFAULT_DECAY_RATE = 900;        // 0.9x decrease per hour
    uint256 public constant BASIS_POINTS = 10000;            // 100% = 10000 basis points
    uint256 public constant HOUR_IN_SECONDS = 3600;
    
    mapping(address => PricingConfig) public pricingConfigs;
    mapping(address => bool) public authorizedMarquees;
    mapping(address => bool) public authorizedFactories;
    
    event PriceInitialized(address indexed marquee, uint256 initialPrice);
    event PriceUpdated(address indexed marquee, uint256 oldPrice, uint256 newPrice);
    event ConfigUpdated(address indexed marquee, uint256 priceMultiplier, uint256 decayRate);
    
    modifier onlyAuthorizedOrFactory() {
        require(authorizedMarquees[msg.sender] || authorizedFactories[msg.sender], "Not authorized");
        _;
    }
    
    constructor() {}
    
    function authorizeMarquee(address _marquee) external onlyOwner {
        authorizedMarquees[_marquee] = true;
    }

    function revokeMarquee(address _marquee) external onlyOwner {
        authorizedMarquees[_marquee] = false;
    }

    function authorizeFactory(address _factory) external onlyOwner {
        authorizedFactories[_factory] = true;
    }

    function initializePrice(address _marquee, uint256 _initialPrice) external onlyAuthorizedOrFactory {
        require(!pricingConfigs[_marquee].initialized, "Already initialized");
        require(_initialPrice > 0, "Price must be positive");
        
        pricingConfigs[_marquee] = PricingConfig({
            basePrice: _initialPrice,
            currentPrice: _initialPrice,
            lastUpdateTime: block.timestamp,
            priceMultiplier: DEFAULT_PRICE_MULTIPLIER,
            decayRate: DEFAULT_DECAY_RATE,
            initialized: true
        });
        
        emit PriceInitialized(_marquee, _initialPrice);
    }
    
    function getCurrentPrice(address _marquee) external view returns (uint256) {
        PricingConfig storage config = pricingConfigs[_marquee];
        require(config.initialized, "Pricing not initialized");
        
        return _calculateCurrentPrice(config);
    }
    
    function updatePrice(address _marquee, uint256 _paymentAmount) external onlyAuthorizedOrFactory {
        PricingConfig storage config = pricingConfigs[_marquee];
        require(config.initialized, "Pricing not initialized");
        
        uint256 oldPrice = _calculateCurrentPrice(config);
        
        // Calculate new price based on actual payment amount
        // This allows overpayment strategy
        uint256 newPrice = (_paymentAmount * config.priceMultiplier) / BASIS_POINTS;
        
        config.currentPrice = newPrice;
        config.lastUpdateTime = block.timestamp;
        
        emit PriceUpdated(_marquee, oldPrice, newPrice);
    }
    
    function _calculateCurrentPrice(PricingConfig storage config) internal view returns (uint256) {
        if (block.timestamp <= config.lastUpdateTime) {
            return config.currentPrice;
        }
        
        uint256 hoursElapsed = (block.timestamp - config.lastUpdateTime) / HOUR_IN_SECONDS;
        
        if (hoursElapsed == 0) {
            return config.currentPrice;
        }
        
        // Calculate price decay: price * (decayRate/10000)^hoursElapsed
        uint256 decayedPrice = config.currentPrice;
        
        for (uint256 i = 0; i < hoursElapsed && i < 100; i++) {
            decayedPrice = (decayedPrice * config.decayRate) / BASIS_POINTS;
        }
        
        return decayedPrice;
    }
    
    function updatePricingConfig(
        address _marquee,
        uint256 _priceMultiplier,
        uint256 _decayRate
    ) external {
        require(authorizedMarquees[_marquee] || msg.sender == owner(), "Not authorized");
        require(_priceMultiplier > 0 && _priceMultiplier <= 100000, "Invalid multiplier");
        require(_decayRate > 0 && _decayRate <= BASIS_POINTS, "Invalid decay rate");
        
        PricingConfig storage config = pricingConfigs[_marquee];
        require(config.initialized, "Pricing not initialized");
        
        config.currentPrice = _calculateCurrentPrice(config);
        config.lastUpdateTime = block.timestamp;
        
        config.priceMultiplier = _priceMultiplier;
        config.decayRate = _decayRate;
        
        emit ConfigUpdated(_marquee, _priceMultiplier, _decayRate);
    }
    
    function updateBasePrice(address _marquee, uint256 _newBasePrice) external {
        require(authorizedMarquees[_marquee] || msg.sender == owner(), "Not authorized");
        require(_newBasePrice > 0, "Price must be positive");
        
        PricingConfig storage config = pricingConfigs[_marquee];
        require(config.initialized, "Pricing not initialized");
        
        config.basePrice = _newBasePrice;
    }
    
    function getPricingConfig(address _marquee) external view returns (
        uint256 basePrice,
        uint256 currentPrice,
        uint256 lastUpdateTime,
        uint256 priceMultiplier,
        uint256 decayRate
    ) {
        PricingConfig storage config = pricingConfigs[_marquee];
        require(config.initialized, "Pricing not initialized");
        
        return (
            config.basePrice,
            _calculateCurrentPrice(config),
            config.lastUpdateTime,
            config.priceMultiplier,
            config.decayRate
        );
    }
}
