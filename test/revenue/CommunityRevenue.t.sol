// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {
    RevenueTestBase,
    RevenueToken,
    RejectingCouncil,
    GasBurningAdapter,
    NoopAdapter,
    ERC1967Proxy,
    CommunityRevenueReceiver,
    CommunityRevenueRouter,
    CommunityRevenueVault,
    GardensCommunityAdapter,
    RevenueEnvelope,
    RevenueIdentity
} from "./RevenueTestBase.sol";
import {RevenueUpgradeable} from "../../contracts/revenue/RevenueUpgradeable.sol";

contract RevenueReceiverV2 is CommunityRevenueReceiver {
    function revision() external pure returns (uint256) {
        return 2;
    }
}

contract RevenueRouterV2 is CommunityRevenueRouter {
    function revision() external pure returns (uint256) {
        return 2;
    }
}

contract GardensAdapterV2 is GardensCommunityAdapter {
    function revision() external pure returns (uint256) {
        return 2;
    }
}

contract CommunityRevenueTest is RevenueTestBase {
    function testGardensReadsSafeAtEveryTransfer() public {
        receiver.receiveNative{value: 1 ether}(envelope(1));
        assertEq(safe.balance, 1 ether);
        address nextSafe = address(0xBEEF);
        community.setCouncilSafe(nextSafe);
        receiver.receiveNative{value: 2 ether}(envelope(2));
        assertEq(safe.balance, 1 ether);
        assertEq(nextSafe.balance, 2 ether);
        assertEq(address(gardens).balance, 0);
    }

    function testGnosisKeepsWETHAndReadsCurrentSafe() public {
        vm.chainId(100);
        receiver = CommunityRevenueReceiver(
            payable(address(
                    new ERC1967Proxy(
                        address(new CommunityRevenueReceiver()),
                        abi.encodeCall(CommunityRevenueReceiver.initialize, (address(this), false))
                    )
                ))
        );
        gardens = GardensCommunityAdapter(
            address(
                new ERC1967Proxy(
                    address(new GardensCommunityAdapter()),
                    abi.encodeCall(GardensCommunityAdapter.initialize, (address(this), address(receiver)))
                )
            )
        );
        receiver.setPlatformAdapter(GARDENS, address(gardens));
        receiver.setExecutor(address(this), true);
        receiver.setAsset(address(weth), true, false);
        weth.mint(address(this), 3 ether);
        weth.approve(address(receiver), 3 ether);
        receiver.receiveToken(envelope(1), address(weth), 1 ether);
        community.setCouncilSafe(address(0xBEEF));
        receiver.receiveToken(envelope(2), address(weth), 2 ether);
        assertEq(weth.balanceOf(safe), 1 ether);
        assertEq(weth.balanceOf(address(0xBEEF)), 2 ether);
        assertEq(safe.balance, 0);
        assertEq(weth.allowance(address(receiver), address(gardens)), 0);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        receiver.setAsset(address(weth), true, true);
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        receiver.receiveNative{value: 1}(envelope(3));
    }

    function testRetryAfterFailedPayoutUsesNewSafe() public {
        community.setCouncilSafe(address(new RejectingCouncil()));
        bytes32 id = receiver.receiveNative{value: 1 ether}(envelope(1));
        assertEq(uint256(status(id)), uint256(CommunityRevenueReceiver.Status.Pending));
        assertEq(receiver.escrowed(address(0)), 1 ether);
        community.setCouncilSafe(address(0xBEEF));
        vm.prank(address(0x123));
        receiver.retryPayout(id);
        assertEq(address(0xBEEF).balance, 1 ether);
        assertEq(receiver.escrowed(address(0)), 0);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        receiver.retryPayout(id);
    }

    function testInvalidCouncilAndIdentityRemainEscrowed() public {
        community.setCouncilSafe(address(0));
        bytes32 id = receiver.receiveNative{value: 1 ether}(envelope(1));
        assertEq(uint256(status(id)), 1);
        RevenueEnvelope memory e = envelope(2);
        e.communityId = bytes32(uint256(e.communityId) | (1 << 200));
        e.communityKey = RevenueIdentity.key(GARDENS, block.chainid, e.communityId);
        assertEq(uint256(status(receiver.receiveNative{value: 1 ether}(e))), 1);
        e.communityKey = bytes32(0);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        receiver.receiveNative{value: 1 ether}(e);
    }

    function testOnlyReceiverCanCallGardens() public {
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        gardens.transferToCommunity{value: 1 ether}(communityId, bytes32(uint256(1)), address(0), 1 ether);
    }

    function testExactSweepNormalizesTokensAndKeepsGrowth() public {
        ethx.mint(address(vault), 2 ether);
        weth.mint(address(vault), 1 ether);
        vm.deal(address(vault), 1 ether);
        sweep(3 ether, 0.01 ether);
        assertEq(safe.balance, 2.99 ether);
        assertEq(vault.availableRevenue(), 1 ether);
        assertEq(ethx.balanceOf(address(vault)), 0);
        assertEq(weth.balanceOf(address(vault)), 0);
        assertEq(address(router).balance, 0);
    }

    function testVaultIdentityDeterministicAndRegistrarOnly() public {
        assertEq(address(vault), router.predictVault(GARDENS, block.chainid, communityId));
        assertEq(router.registerCommunity(GARDENS, block.chainid, communityId), address(vault));
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        router.registerCommunity(GARDENS, block.chainid, bytes32(uint256(9)));
        vm.expectRevert(CommunityRevenueVault.Unauthorized.selector);
        vault.initialize(key, address(ethx), address(weth));
        vm.expectRevert(CommunityRevenueVault.Unauthorized.selector);
        vault.releaseRevenue(1);
    }

    function testFuzzKeeperFeeBound(uint96 rawAmount, uint16 rawFee) public {
        uint256 amount = bound(rawAmount, 10000, 100 ether);
        uint256 fee = bound(rawFee, 0, amount / 100);
        vm.deal(address(vault), amount);
        sweep(amount, fee);
        assertEq(safe.balance, amount - fee);
        assertEq(vault.availableRevenue(), 0);
    }

    function testRejectedSweepDoesNotReleaseFundsOrAdvanceNonce() public {
        vm.deal(address(vault), 1 ether);
        bytes32 payoutId = router.nextPayoutId(key);
        vm.expectRevert(RevenueUpgradeable.InvalidAmount.selector);
        router.sweep(key, payoutId, 1 ether, 0.011 ether, 0, 0.989 ether, "");
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        router.sweep(key, bytes32(uint256(123)), 1 ether, 0, 0, 1 ether, "");
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        router.sweep(key, bytes32(0), 1 ether, 0, 0, 1 ether, "");
        assertEq(vault.availableRevenue(), 1 ether);
        assertEq(router.payoutNonce(), 0);
    }

    function testSweepOnlyInvalidatesItsOwnCommunityQuotes() public {
        bytes32 otherId = bytes32(uint256(9));
        bytes32 otherKey = RevenueIdentity.key(GARDENS, block.chainid, otherId);
        router.registerCommunity(GARDENS, block.chainid, otherId);
        bytes32 otherQuote = router.nextPayoutId(otherKey);
        bytes32 ownQuote = router.nextPayoutId(key);
        vm.deal(address(vault), 1 ether);
        sweep(1 ether, 0);
        assertEq(router.nextPayoutId(otherKey), otherQuote);
        assertTrue(router.nextPayoutId(key) != ownQuote);
        assertEq(router.communityPayoutNonce(key), 1);
        assertEq(router.communityPayoutNonce(otherKey), 0);
        assertEq(router.payoutNonce(), 1);
    }

    function testLocalReplayRejectedButFundedBridgeIdsCannotBePoisoned() public {
        receiver.setLocalRouter(address(this), true);
        RevenueEnvelope memory e = envelope(1);
        receiver.receiveLocal{value: 1 ether}(e);
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        receiver.receiveLocal{value: 1 ether}(e);
        bytes32 first = receiver.receiveNative{value: 1 ether}(e);
        bytes32 second = receiver.receiveNative{value: 2 ether}(e);
        assertTrue(first != second);
        assertEq(safe.balance, 4 ether);
        vm.expectRevert(RevenueUpgradeable.InvalidAmount.selector);
        receiver.receiveNative(e);
    }

    function testForgedCallbacksCannotSpendEscrow() public {
        receiver.setPlatformAdapter(GARDENS, address(0));
        receiver.receiveNative{value: 1 ether}(envelope(1));
        vm.deal(address(0xBAD), 1);
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        receiver.receiveNative{value: 1}(envelope(2));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        receiver.handleV3AcrossMessage(address(weth), 1, address(0), abi.encode(envelope(2)));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        receiver.executeDelivery(receiptId(0));
        assertEq(receiver.escrowed(address(0)), 1 ether);
    }

    function testAcrossCannotReuseReservedTokenBalance() public {
        receiver.setAsset(address(weth), true, false);
        receiver.setPlatformAdapter(GARDENS, address(0));
        receiver.setAcrossSpokePool(address(this));
        weth.mint(address(receiver), 1 ether);
        receiver.handleV3AcrossMessage(address(weth), 1 ether, address(0), abi.encode(envelope(1)));
        vm.expectRevert(RevenueUpgradeable.InvalidAmount.selector);
        receiver.handleV3AcrossMessage(address(weth), 1 ether, address(0), abi.encode(envelope(1)));
        assertEq(receiver.escrowed(address(weth)), 1 ether);
    }

    function testLowGasAndGasBurningAdapterStillEscrow() public {
        receiver.setPlatformAdapter(GARDENS, address(new GasBurningAdapter()));
        (bool ok, bytes memory data) =
            address(receiver).call{value: 1 ether, gas: 650_000}(abi.encodeCall(receiver.receiveNative, (envelope(1))));
        assertTrue(ok);
        assertEq(uint256(status(abi.decode(data, (bytes32)))), 1);
        assertEq(receiver.escrowed(address(0)), 1 ether);
        receiver.setPlatformAdapter(GARDENS, address(gardens));
        receiver.retryPayout(receiptId(0));
        assertEq(safe.balance, 1 ether);
    }

    function testNormalDeliveryWithBoundedBridgeGas() public {
        (bool ok, bytes memory data) =
            address(receiver).call{value: 1 ether, gas: 650_000}(abi.encodeCall(receiver.receiveNative, (envelope(1))));
        assertTrue(ok);
        assertEq(uint256(status(abi.decode(data, (bytes32)))), 2);
    }

    function testTokenNoopCannotBeMarkedDeliveredAndApprovalRollsBack() public {
        address noop = address(new NoopAdapter());
        receiver.setPlatformAdapter(GARDENS, noop);
        receiver.setAsset(address(weth), true, false);
        weth.mint(address(this), 1 ether);
        weth.approve(address(receiver), 1 ether);
        bytes32 id = receiver.receiveToken(envelope(1), address(weth), 1 ether);
        assertEq(uint256(status(id)), 1);
        assertEq(receiver.escrowed(address(weth)), 1 ether);
        assertEq(weth.allowance(address(receiver), noop), 0);
    }

    function testOwnerRecoveryCannotRecoverOrRetryTwice() public {
        receiver.setPlatformAdapter(GARDENS, address(0));
        bytes32 id = receiver.receiveNative{value: 1 ether}(envelope(1));
        vm.prank(address(0xBAD));
        vm.expectRevert();
        receiver.recoverPayout(id, payable(safe));
        vm.expectRevert(RevenueUpgradeable.InvalidAmount.selector);
        receiver.recoverSurplus(address(0), payable(safe));
        vm.deal(address(receiver), 1.1 ether);
        receiver.recoverSurplus(address(0), payable(safe));
        assertEq(receiver.escrowed(address(0)), 1 ether);
        receiver.recoverPayout(id, payable(safe));
        assertEq(safe.balance, 1.1 ether);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        receiver.recoverPayout(id, payable(safe));
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        receiver.retryPayout(id);
    }

    function testUUPSAuthorizationAndStoragePreserved() public {
        receiver.setPlatformAdapter(GARDENS, address(0));
        bytes32 id = receiver.receiveNative{value: 1 ether}(envelope(1));
        address nextReceiver = address(new RevenueReceiverV2());
        vm.prank(address(0xBAD));
        vm.expectRevert();
        receiver.upgradeToAndCall(nextReceiver, "");
        receiver.upgradeToAndCall(nextReceiver, "");
        router.upgradeToAndCall(address(new RevenueRouterV2()), "");
        gardens.upgradeToAndCall(address(new GardensAdapterV2()), "");
        assertEq(RevenueReceiverV2(payable(address(receiver))).revision(), 2);
        assertEq(receiver.owner(), address(this));
        assertEq(router.registrars(GARDENS), address(this));
        assertEq(router.registerCommunity(GARDENS, block.chainid, communityId), address(vault));
        assertEq(gardens.receiver(), address(receiver));
        assertEq(receiver.escrowed(address(0)), 1 ether);
        receiver.setPlatformAdapter(GARDENS, address(gardens));
        receiver.retryPayout(id);
        assertEq(safe.balance, 1 ether);
        vm.expectRevert();
        CommunityRevenueReceiver(payable(nextReceiver)).initialize(address(this), true);
        vm.expectRevert();
        receiver.initialize(address(this), true);
        vm.expectRevert();
        receiver.renounceOwnership();
    }
}
