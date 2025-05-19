// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/MarqueeFactory.sol";
import "../src/DynamicPricingModule.sol";

contract DeployMarqueeSystem is Script {
    
    // Deployment configuration
    struct DeployConfig {
        uint256 platformFeePercentage;  // In basis points (100 = 1%)
        address platformFeeRecipient;
        uint256 defaultMaxMessageLength;
        string initialGlobalMessage;
        uint256 initialGlobalMessagePrice;
    }
    
    // Chain-specific configurations
    mapping(uint256 => DeployConfig) public configs;
    
    function setUp() public {
        // Ethereum Mainnet
        configs[1] = DeployConfig({
            platformFeePercentage: 250, // 2.5%
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee - The decentralized fundraising platform!",
            initialGlobalMessagePrice: 1 ether
        });
        
        // Optimism
        configs[10] = DeployConfig({
            platformFeePercentage: 250,
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee on Optimism!",
            initialGlobalMessagePrice: 0.1 ether
        });
        
        // Arbitrum
        configs[42161] = DeployConfig({
            platformFeePercentage: 250,
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee on Arbitrum!",
            initialGlobalMessagePrice: 0.1 ether
        });
        
        // Polygon
        configs[137] = DeployConfig({
            platformFeePercentage: 250,
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee on Polygon!",
            initialGlobalMessagePrice: 100 ether // MATIC
        });
        
        // Base
        configs[8453] = DeployConfig({
            platformFeePercentage: 250,
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee on Base!",
            initialGlobalMessagePrice: 0.1 ether
        });
        
        // Gnosis Chain
        configs[100] = DeployConfig({
            platformFeePercentage: 250,
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee on Gnosis Chain!",
            initialGlobalMessagePrice: 10 ether // xDAI
        });
        
        // Celo
        configs[42220] = DeployConfig({
            platformFeePercentage: 250,
            platformFeeRecipient: 0x742d35Cc6506C2f13E66AdCC8C8D07053BE7b6e1, // Replace with actual address
            defaultMaxMessageLength: 200,
            initialGlobalMessage: "Welcome to Markee on Celo!",
            initialGlobalMessagePrice: 100 ether // CELO
        });
    }
    
    function run() external {
        uint256 chainId = block.chainid;
        DeployConfig memory config = configs[chainId];
        
        require(config.platformFeeRecipient != address(0), "Chain not configured");
        
        vm.startBroadcast();
        
        // Deploy MarqueeFactory
        MarqueeFactory factory = new MarqueeFactory(
            config.platformFeePercentage,
            config.platformFeeRecipient,
            config.defaultMaxMessageLength,
            config.initialGlobalMessage,
            config.initialGlobalMessagePrice
        );
        
        console.log("MarqueeFactory deployed at:", address(factory));
        console.log("Default pricing module deployed at:", address(factory.defaultPricingModule()));
        
        // Get the default pricing module address
        address defaultPricingModule = address(factory.defaultPricingModule());
        
        vm.stopBroadcast();
        
        // Save deployment addresses
        string memory json = "deployment_addresses";
        vm.serializeString(json, "chain_id", vm.toString(chainId));
        vm.serializeAddress(json, "marquee_factory", address(factory));
        vm.serializeAddress(json, "default_pricing_module", defaultPricingModule);
        string memory finalJson = vm.serializeString(json, "chain_name", getChainName(chainId));
        
        string memory fileName = string(abi.encodePacked("./deployments/", vm.toString(chainId), ".json"));
        vm.writeJson(finalJson, fileName);
        
        console.log("Deployment addresses saved to:", fileName);
    }
    
    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "ethereum";
        if (chainId == 10) return "optimism";
        if (chainId == 42161) return "arbitrum";
        if (chainId == 137) return "polygon";
        if (chainId == 8453) return "base";
        if (chainId == 100) return "gnosis";
        if (chainId == 42220) return "celo";
        return "unknown";
    }
}

// Test deployment script for local/testnet
contract TestDeploy is Script {
    function run() external {
        vm.startBroadcast();
        
        // Deploy with test configuration
        MarqueeFactory factory = new MarqueeFactory(
            100, // 1% platform fee
            msg.sender, // Use deployer as fee recipient
            500, // Higher character limit for testing
            "Test Markee - Edit me!",
            0.001 ether // Low price for testing
        );
        
        console.log("Test MarqueeFactory deployed at:", address(factory));
        
        // Create a test marquee
        address testMarquee = factory.createMarquee(
            "Test Fundraiser",
            "This is a test marquee for development",
            "Hello World! This is a test message.",
            msg.sender,
            0.001 ether,
            200,
            true, // Enable global message
            false, // Use default pricing
            0,
            0
        );
        
        console.log("Test Marquee created at:", testMarquee);
        
        vm.stopBroadcast();
    }
}