// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {
    RevenueTestBase,
    CommunityRevenueReceiver,
    GardensCommunityAdapter,
    RevenueCommunity,
    RevenueToken,
    RevenueEnvelope,
    RevenueIdentity
} from "./RevenueTestBase.sol";

contract RevenueHandler is Test {
    CommunityRevenueReceiver public receiver;
    GardensCommunityAdapter public adapter;
    RevenueCommunity public community;
    RevenueToken public token;
    bytes32 public platform;
    bytes32 public communityId;
    bytes32[] public receipts;
    address public safeA = address(0xCAFE);
    address public safeB = address(0xBEEF);
    address public recovery = address(0xDEAD);
    uint256 public nativeFunded;
    uint256 public tokenFunded;

    constructor(
        CommunityRevenueReceiver receiver_,
        GardensCommunityAdapter adapter_,
        RevenueCommunity community_,
        RevenueToken token_,
        bytes32 platform_
    ) {
        receiver = receiver_;
        adapter = adapter_;
        community = community_;
        token = token_;
        platform = platform_;
        communityId = bytes32(uint256(uint160(address(community_))));
    }

    function acceptOwnership() external {
        receiver.acceptOwnership();
    }

    function deposit(uint96 rawAmount, bool useToken, bool failDelivery, bool secondSafe) external {
        uint256 amount = bound(rawAmount, 1, 10 ether);
        community.setCouncilSafe(secondSafe ? safeB : safeA);
        receiver.setPlatformAdapter(platform, failDelivery ? address(0) : address(adapter));
        RevenueEnvelope memory e = RevenueEnvelope(
            bytes32(receipts.length + 1),
            RevenueIdentity.key(platform, block.chainid, communityId),
            platform,
            communityId
        );
        bytes32 id;
        if (useToken) {
            token.mint(address(this), amount);
            token.approve(address(receiver), amount);
            id = receiver.receiveToken(e, address(token), amount);
            tokenFunded += amount;
        } else {
            vm.deal(address(this), amount);
            id = receiver.receiveNative{value: amount}(e);
            nativeFunded += amount;
        }
        receipts.push(id);
    }

    function settle(uint256 seed, bool recover, bool secondSafe) external {
        if (receipts.length == 0) return;
        bytes32 id = receipts[seed % receipts.length];
        (,,, CommunityRevenueReceiver.Status state) = receiver.payouts(id);
        if (state != CommunityRevenueReceiver.Status.Pending) return;
        if (recover) {
            receiver.recoverPayout(id, payable(recovery));
        } else {
            community.setCouncilSafe(secondSafe ? safeB : safeA);
            receiver.setPlatformAdapter(platform, address(adapter));
            receiver.retryPayout(id);
        }
    }

    function receiptCount() external view returns (uint256) {
        return receipts.length;
    }
}

contract RevenueInvariantTest is RevenueTestBase {
    RevenueHandler handler;

    function setUp() public override {
        super.setUp();
        receiver.setAsset(address(weth), true, false);
        handler = new RevenueHandler(receiver, gardens, community, weth, GARDENS);
        receiver.setExecutor(address(handler), true);
        receiver.transferOwnership(address(handler));
        handler.acceptOwnership();
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = RevenueHandler.deposit.selector;
        selectors[1] = RevenueHandler.settle.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantFundsAreConserved() public view {
        address a = handler.safeA();
        address b = handler.safeB();
        address recovery = handler.recovery();
        assertEq(handler.nativeFunded(), a.balance + b.balance + recovery.balance + address(receiver).balance);
        assertEq(
            handler.tokenFunded(),
            weth.balanceOf(a) + weth.balanceOf(b) + weth.balanceOf(recovery) + weth.balanceOf(address(receiver))
        );
        assertEq(receiver.escrowed(address(0)), address(receiver).balance);
        assertEq(receiver.escrowed(address(weth)), weth.balanceOf(address(receiver)));
        assertEq(weth.allowance(address(receiver), address(gardens)), 0);
    }

    function invariantEscrowMatchesPendingPayouts() public view {
        uint256 nativePending;
        uint256 tokenPending;
        for (uint256 i; i < handler.receiptCount(); ++i) {
            (, address token, uint256 amount, CommunityRevenueReceiver.Status state) =
                receiver.payouts(handler.receipts(i));
            if (state == CommunityRevenueReceiver.Status.Pending) {
                if (token == address(0)) nativePending += amount;
                else tokenPending += amount;
            }
        }
        assertEq(receiver.escrowed(address(0)), nativePending);
        assertEq(receiver.escrowed(address(weth)), tokenPending);
    }
}
