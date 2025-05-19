// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/MarqueeFactory.sol";
import "../src/Marquee.sol";
import "../src/DynamicPricingModule.sol";

contract MarqueeTest is Test {
    MarqueeFactory public factory;
    Marquee public marquee;
    DynamicPricingModule public pricingModule;
    
    address public owner = address(this);
    address public beneficiary = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    
    function setUp() public {
        // Deploy factory
        factory = new MarqueeFactory(
            250, // 2.5% platform fee
            owner, // Platform fee recipient
            200, // Max message length
            "Global message", // Initial global message
            1 ether // Initial global message price
        );
        
        // Create a marquee
        address marqueeAddress = factory.createMarquee(
            "Test Marquee",
            "A test marquee for testing",
            "Initial message",
            beneficiary,
            0.01 ether, // Initial price
            200, // Max message length
            true, // Enable global message
            false, // Don't use custom pricing
            0, // Price multiplier (ignored)
            0  // Decay rate (ignored)
        );
        
        marquee = Marquee(marqueeAddress);
        pricingModule = factory.defaultPricingModule();
    }
    
    function testInitialState() public {
        assertEq(marquee.message(), "Initial message");
        assertEq(marquee.title(), "Test Marquee");
        assertEq(marquee.beneficiary(), beneficiary);
        assertEq(marquee.getCurrentPrice(), 0.01 ether);
    }
    
    function testSetMessage() public {
        uint256 price = marquee.getCurrentPrice();
        
        // Give user1 some ETH
        vm.deal(user1, 1 ether);
        
        // User1 changes the message with exact payment
        vm.prank(user1);
        marquee.setMessage{value: price}("New message from user1");
        
        // Check the message was updated
        assertEq(marquee.message(), "New message from user1");
        
        // Check price increased by 10x the payment amount
        assertEq(marquee.getCurrentPrice(), price * 10);
        
        // Check analytics
        (uint256 totalRaised, uint256 totalChanges, uint256 uniqueContributors,) = marquee.getAnalytics();
        assertEq(totalRaised, price);
        assertEq(totalChanges, 1);
        assertEq(uniqueContributors, 1);
    }
    
    function testOverpaymentStrategy() public {
        uint256 requiredPrice = marquee.getCurrentPrice();
        
        // User pays 5x the required amount to make it harder for next person
        uint256 overpayment = requiredPrice * 5;
        
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        marquee.setMessage{value: overpayment}("Protected message");
        
        // Next price should be 10x the overpayment (not just the required price)
        uint256 nextPrice = marquee.getCurrentPrice();
        assertEq(nextPrice, overpayment * 10);
        
        // This makes it much more expensive for the next person!
        // If required was 0.01 ETH and they paid 0.05 ETH,
        // next person needs 0.5 ETH instead of just 0.1 ETH
    }
    
    function testPriceDecay() public {
        uint256 initialPrice = marquee.getCurrentPrice();
        
        // User changes message
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        marquee.setMessage{value: initialPrice}("Price test");
        
        uint256 newPrice = marquee.getCurrentPrice();
        assertEq(newPrice, initialPrice * 10); // 10x increase
        
        // Fast forward 1 hour
        vm.warp(block.timestamp + 3600);
        
        // Price should have decayed to 90% of newPrice
        uint256 expectedDecayedPrice = (newPrice * 900) / 10000;
        uint256 actualDecayedPrice = marquee.getCurrentPrice();
        
        // Allow for small rounding differences
        assertApproxEqRel(actualDecayedPrice, expectedDecayedPrice, 0.01e18); // 1% tolerance
    }
    
    function testInsufficientPayment() public {
        uint256 price = marquee.getCurrentPrice();
        
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        
        // Try to pay less than required
        vm.expectRevert("Insufficient payment");
        marquee.setMessage{value: price - 1}("Should fail");
    }
    
    function testMessageTooLong() public {
        uint256 price = marquee.getCurrentPrice();
        string memory longMessage = "The hiiiiiiiiilllllls are aliiiivee with the sound of muuuuuuussssicccc LAA LA LA LALAAAAAAAA....... this message is way too long and should definitely exceed the maximum message length limit that was set for this marquee contract during deployment and should cause a revert when we try to set it";
        
        // Debug: check the actual max length
        uint256 maxLength = marquee.maxMessageLength();
        emit log_named_uint("Max message length", maxLength);
        emit log_named_uint("Test message length", bytes(longMessage).length);
        
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        
        vm.expectRevert("Message too long");
        marquee.setMessage{value: price}(longMessage);
    }
}
