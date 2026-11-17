// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueTestBase, CommunityRevenueVault, RevenueEnvelope, RevenueIdentity} from "./RevenueTestBase.sol";
import {RevenueSpoke} from "./BridgeAdapters.t.sol";
import {AcrossRevenueBridgeAdapter} from "../../contracts/revenue/bridges/AcrossRevenueBridgeAdapter.sol";
import {RevenueUpgradeable} from "../../contracts/revenue/RevenueUpgradeable.sol";

/// @dev Simulates source and destination execution separately. It does not assert
/// Across supports Gnosis: the remote chain in this mock tests the WETH boundary.
contract RouterBridgeTest is RevenueTestBase {
    RevenueSpoke spoke;
    AcrossRevenueBridgeAdapter across;
    bytes32 constant ACROSS = keccak256("across");

    function setUp() public override {
        super.setUp();
        spoke = new RevenueSpoke();
        across = new AcrossRevenueBridgeAdapter(address(this), address(router), address(spoke), address(weth));
        across.setDestinationToken(100, address(weth));
        router.setBridge(100, ACROSS, address(across));
        router.setReceiver(100, address(receiver));
        key = RevenueIdentity.key(GARDENS, 100, communityId);
        vault = CommunityRevenueVault(payable(router.registerCommunity(GARDENS, 100, communityId)));
        receiver.setAcrossSpokePool(address(spoke));
        receiver.setAsset(address(weth), true, false);
        ethx.mint(address(vault), 1 ether);
    }

    function testRemoteSweepAndDestinationDelivery() public {
        bytes32 payoutId = router.nextPayoutId(key);
        router.sweep{value: 0.02 ether}(
            key,
            payoutId,
            1 ether,
            0.005 ether,
            ACROSS,
            0.99 ether,
            abi.encode(AcrossRevenueBridgeAdapter.Quote(0.992 ether, uint32(block.timestamp + 1 hours)))
        );
        assertEq(vault.availableRevenue(), 0.02 ether);
        assertEq(address(router).balance, 0);
        assertEq(weth.balanceOf(safe), 0); // submission is not delivery
        assertEq(router.payoutNonce(), 1);
        assertEq(spoke.depositor(), address(vault));
        vm.chainId(100);
        weth.mint(address(receiver), spoke.outputAmount());
        bytes memory message = spoke.message();
        vm.prank(address(spoke));
        receiver.handleV3AcrossMessage(address(weth), 0.992 ether, address(0), message);
        assertEq(weth.balanceOf(safe), 0.992 ether);
        assertEq(receiver.escrowed(address(weth)), 0);
        assertEq(uint256(status(receiptId(0))), 2);
    }

    function testBridgeRevertRestoresVaultAndNonce() public {
        bytes32 payoutId = router.nextPayoutId(key);
        bytes memory expired = abi.encode(AcrossRevenueBridgeAdapter.Quote(0.99 ether, uint32(block.timestamp)));
        vm.expectRevert();
        router.sweep(key, payoutId, 1 ether, 0, ACROSS, 0.99 ether, expired);
        assertEq(ethx.balanceOf(address(vault)), 1 ether);
        assertEq(address(spoke).balance, 0);
        assertEq(router.payoutNonce(), 0);
    }

    function testKeeperCannotBypassBridgeLossFloor() public {
        bytes32 payoutId = router.nextPayoutId(key);
        vm.expectRevert(RevenueUpgradeable.InvalidAmount.selector);
        router.sweep(
            key,
            payoutId,
            1 ether,
            0,
            ACROSS,
            0.98 ether,
            abi.encode(AcrossRevenueBridgeAdapter.Quote(0.98 ether, uint32(block.timestamp + 1 hours)))
        );
        assertEq(ethx.balanceOf(address(vault)), 1 ether);
    }

    function testPauseBlocksFuturePayoutsWithoutMovingFunds() public {
        bytes32 payoutId = router.nextPayoutId(key);
        router.setBridge(100, ACROSS, address(0));
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        router.sweep(key, payoutId, 1 ether, 0, ACROSS, 0.99 ether, "");
        assertEq(ethx.balanceOf(address(vault)), 1 ether);
    }
}
