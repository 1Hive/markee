// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperApp.sol";
import { ISuperAgreement } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperAgreement.sol";
import { ISuperfluidPool } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/gdav1/ISuperfluidPool.sol";
import { ISETH } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/tokens/ISETH.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { StreamingLeaderboardFactory } from "../contracts/streaming/StreamingLeaderboardFactory.sol";
import { StreamingLeaderboard } from "../contracts/streaming/StreamingLeaderboard.sol";
import { LeaderboardFactory } from "../contracts/v1.3/LeaderboardFactory.sol";
import { Leaderboard } from "../contracts/v1.3/Leaderboard.sol";

// Minimal external interfaces for driving Superfluid from test EOAs.
interface ICFAForwarder {
    function createFlow(ISuperToken token, address sender, address receiver, int96 flowrate, bytes memory userData)
        external returns (bool);
    function updateFlow(ISuperToken token, address sender, address receiver, int96 flowrate, bytes memory userData)
        external returns (bool);
    function deleteFlow(ISuperToken token, address sender, address receiver, bytes memory userData)
        external returns (bool);
    function getFlowrate(ISuperToken token, address sender, address receiver) external view returns (int96);
}

interface IGDAForwarder {
    function connectPool(ISuperfluidPool pool, bytes memory userData) external returns (bool);
}

interface IGov {
    function setAppRegistrationKey(
        ISuperfluid host,
        address deployer,
        string memory registrationKey,
        uint256 expirationTs
    ) external;
}

interface IOwnable {
    function owner() external view returns (address);
}

interface IMarkee {
    function pricingStrategy() external view returns (address);
}

/// @notice Base-mainnet fork tests for the Option B streaming strategy. Reads BASE_RPC_URL from env.
/// Run: BASE_RPC_URL=<base-rpc> forge test --match-contract StreamingLeaderboardTest -vvv
contract StreamingLeaderboardTest is Test {
    // ─── Base (chain 8453) addresses ──────────────────────────────────────────
    address constant HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    ISuperToken constant ETHX = ISuperToken(0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93);
    ICFAForwarder constant CFA = ICFAForwarder(0xcfA132E353cB4E398080B9700609bb008eceB125);
    IGDAForwarder constant GDA = IGDAForwarder(0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08);
    address constant REVNET_TERMINAL = 0x2dB6d704058E552DeFE415753465df8dF0361846;
    uint256 constant REVNET_PROJECT = 152;

    uint256 constant SECONDS_IN_MONTH = 2628000;
    uint256 constant BUFFER_PERIOD = 14400;
    uint256 constant BPS = 10000;

    StreamingLeaderboardFactory factory;
    StreamingLeaderboard board;
    address admin = makeAddr("admin");
    address beneficiary = makeAddr("beneficiary");
    address seedMarkee;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_RPC_URL"));

        // Sanity: the SF infra we depend on exists on this fork.
        assertGt(address(ETHX).code.length, 0, "ETHx missing");
        assertGt(HOST.code.length, 0, "host missing");
        assertGt(address(CFA).code.length, 0, "CFA forwarder missing");
        assertGt(address(GDA).code.length, 0, "GDA forwarder missing");

        factory = new StreamingLeaderboardFactory(
            "Streaming", "streaming", ISuperfluid(HOST), ETHX, REVNET_TERMINAL, REVNET_PROJECT, address(0), admin
        );

        // Authorize the factory to register SuperApps on the permissioned Base host (governance action;
        // in production the SF multisig does this once). Legacy default registration key is "k1".
        ISuperfluid host = ISuperfluid(HOST);
        address gov = address(host.getGovernance());
        address govOwner = IOwnable(gov).owner();
        vm.prank(govOwner);
        IGov(gov).setAppRegistrationKey(host, address(factory), "k1", type(uint256).max);

        (address b, address s) = factory.createLeaderboard(beneficiary, "Test Board");
        board = StreamingLeaderboard(payable(b));
        seedMarkee = s;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _rate(uint256 monthlyWei) internal pure returns (int96) {
        return int96(int256(monthlyWei / SECONDS_IN_MONTH));
    }

    function _fund(address who) internal {
        vm.deal(who, 100 ether);
        vm.startPrank(who);
        ISETH(address(ETHX)).upgradeByETH{value: 50 ether}();
        IERC20(address(ETHX)).approve(address(board), type(uint256).max);
        vm.stopPrank();
    }

    function _backer(string memory name) internal returns (address who) {
        who = makeAddr(name);
        _fund(who);
    }

    /// @dev Deposit buffer, connect to the Markee's pool, then open the inbound stream tagged with the Markee.
    function _open(address who, address markee, int96 rate) internal {
        uint256 deposit = uint256(uint96(rate)) * BUFFER_PERIOD;
        vm.startPrank(who);
        board.depositBuffer(deposit);
        GDA.connectPool(board.poolOf(markee), "");
        CFA.createFlow(ETHX, who, address(board), rate, abi.encode(markee));
        vm.stopPrank();
    }

    function _newMarkee(string memory msg_, string memory name_) internal returns (address m) {
        address creator = makeAddr(string.concat("creator-", name_));
        vm.prank(creator);
        m = board.createMarkee(msg_, name_);
    }

    function _notJailed() internal view {
        assertFalse(ISuperfluid(HOST).isAppJailed(ISuperApp(address(board))), "app jailed");
    }

    function _beneficiaryFlow() internal view returns (int96) {
        return CFA.getFlowrate(ETHX, address(board), beneficiary);
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    function test_setup_registersSuperApp_notJailed() public view {
        assertTrue(ISuperfluid(HOST).isApp(ISuperApp(address(board))), "not registered as app");
        _notJailed();
        assertEq(factory.leaderboardCount(), 1);
        assertTrue(board.isMarkeeOnLeaderboard(seedMarkee), "seed markee not registered");
        assertTrue(address(board.poolOf(seedMarkee)) != address(0), "seed pool not created");
    }

    function test_createMarkee_createsPool() public {
        address m = _newMarkee("hello", "alpha");
        assertTrue(board.isMarkeeOnLeaderboard(m));
        assertTrue(address(board.poolOf(m)) != address(0), "pool not created");
    }

    function test_firstBacker_becomesTop_andBeneficiaryStreamOpens() public {
        address m = _newMarkee("msg", "alpha");
        int96 r = _rate(0.02 ether);
        address backer = _backer("backerA");
        _open(backer, m, r);

        assertEq(board.topMarkee(), m, "not top");
        assertEq(board.aggregateRate(m), uint256(uint96(r)), "aggregate wrong");

        int96 expected = int96(int256(uint256(uint96(r)) * 6200 / BPS));
        assertEq(_beneficiaryFlow(), expected, "beneficiary flow != 62%");
        _notJailed();
    }

    function test_secondMarkee_overtakes_autoFlipInCallback() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");

        _open(_backer("backerA"), a, _rate(0.01 ether));
        assertEq(board.topMarkee(), a, "A should be top");

        _open(_backer("backerB"), b, _rate(0.02 ether));
        assertEq(board.topMarkee(), b, "B should auto-flip to top");
        assertEq(board.refundRate(a), board.aggregateRate(a), "old top A not refunded at its aggregate");
        assertEq(board.refundRate(b), 0, "new top B should not be refunded");
        _notJailed();
    }

    function test_loserRefund_netZero() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");

        address backerA = _backer("backerA");
        _open(backerA, a, _rate(0.01 ether)); // A becomes top
        _open(_backer("backerB"), b, _rate(0.03 ether)); // B overtakes; A becomes loser, refunded

        // A's pool refund rate equals A's aggregate → A's backer nets ≈ zero.
        assertEq(board.refundRate(a), board.aggregateRate(a), "refund != aggregate");
        assertGt(board.refundRate(a), 0, "no refund flowing to loser");
        _notJailed();
    }

    function test_multiWalletAggregate_sums() public {
        address m = _newMarkee("m", "alpha");
        int96 r1 = _rate(0.01 ether);
        int96 r2 = _rate(0.015 ether);
        _open(_backer("w1"), m, r1);
        _open(_backer("w2"), m, r2);

        assertEq(board.aggregateRate(m), uint256(uint96(r1)) + uint256(uint96(r2)), "aggregate != sum");
        assertEq(board.topMarkee(), m);
        _notJailed();
    }

    function test_decay_thenClaimTop_flips() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");

        address backerA = _backer("backerA");
        _open(backerA, a, _rate(0.03 ether)); // A top
        _open(_backer("backerB"), b, _rate(0.02 ether)); // B loser (< A)
        assertEq(board.topMarkee(), a);

        // A decays below B (no auto-flip on decay).
        vm.prank(backerA);
        CFA.updateFlow(ETHX, backerA, address(board), _rate(0.005 ether), abi.encode(a));
        assertEq(board.topMarkee(), a, "should remain stale-top after decay");
        assertLt(board.aggregateRate(a), board.aggregateRate(b), "A should now be below B");

        // Permissionless poke promotes B.
        board.claimTop(b);
        assertEq(board.topMarkee(), b, "claimTop did not flip");
        assertEq(board.refundRate(b), 0, "new top should not be refunded");
        _notJailed();
    }

    function test_noDeposit_inboundStreamRejected() public {
        address m = _newMarkee("m", "alpha");
        address who = makeAddr("nodeposit");
        vm.deal(who, 100 ether);
        vm.startPrank(who);
        ISETH(address(ETHX)).upgradeByETH{value: 50 ether}();
        vm.expectRevert();
        CFA.createFlow(ETHX, who, address(board), _rate(0.01 ether), abi.encode(m));
        vm.stopPrank();
    }

    function test_closeStream_jailSafe() public {
        address m = _newMarkee("m", "alpha");
        address backer = _backer("backerA");
        _open(backer, m, _rate(0.02 ether));
        assertEq(board.topMarkee(), m);

        vm.prank(backer);
        CFA.deleteFlow(ETHX, backer, address(board), "");

        assertEq(board.aggregateRate(m), 0, "aggregate not cleared on close");
        assertEq(board.backerMarkee(backer), address(0), "backer not cleared");
        _notJailed();
    }

    // ─── Settlement accumulator ────────────────────────────────────────────────

    function _r(int96 rate) internal pure returns (uint256) {
        return uint256(uint96(rate));
    }

    function test_settlementAccrues_overTime() public {
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.02 ether);
        address backer = _backer("backerA");
        _open(backer, m, r);
        assertEq(board.topMarkee(), m);
        assertEq(board.pendingSettlement(backer), 0, "should accrue nothing at t0");

        uint256 dt = 30 days;
        vm.warp(block.timestamp + dt);

        // RevNet share is 38% (10000 - percentToBeneficiary 6200) of the top inflow over time.
        uint256 expected = _r(r) * dt * (BPS - factory.percentToBeneficiary()) / BPS;
        assertApproxEqRel(board.pendingSettlement(backer), expected, 1e15, "accrual != ~38% of inflow");
        _notJailed();
    }

    function test_settlementProRata_byFlowRate() public {
        address m = _newMarkee("m", "alpha");
        int96 r1 = _rate(0.01 ether);
        int96 r2 = _rate(0.03 ether);
        address w1 = _backer("w1");
        address w2 = _backer("w2");
        _open(w1, m, r1);
        _open(w2, m, r2);

        vm.warp(block.timestamp + 15 days);

        uint256 p1 = board.pendingSettlement(w1);
        uint256 p2 = board.pendingSettlement(w2);
        assertGt(p1, 0, "w1 accrued nothing");
        assertGt(p2, 0, "w2 accrued nothing");
        // p1/p2 == r1/r2  →  p1*r2 == p2*r1
        assertApproxEqRel(p1 * _r(r2), p2 * _r(r1), 1e15, "settlement not pro-rata to flow rate");
        _notJailed();
    }

    function test_topFlip_freezesOldTopAccrual() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");
        address backerA = _backer("backerA");
        address backerB = _backer("backerB");

        _open(backerA, a, _rate(0.01 ether)); // A top
        vm.warp(block.timestamp + 10 days);

        _open(backerB, b, _rate(0.02 ether)); // B overtakes → auto-flip in callback
        assertEq(board.topMarkee(), b, "B should be top after overtake");

        uint256 paAtFlip = board.pendingSettlement(backerA);
        assertGt(paAtFlip, 0, "A backer should have accrued while #1");
        assertEq(board.pendingSettlement(backerB), 0, "B accrual starts at the flip");

        vm.warp(block.timestamp + 10 days);
        assertEq(board.pendingSettlement(backerA), paAtFlip, "A accrual must freeze once it loses #1");
        assertGt(board.pendingSettlement(backerB), 0, "B accrual must grow while #1");
        _notJailed();
    }

    function test_settle_directWhenRevNetDisabled() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);

        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.02 ether);
        address backer = _backer("backerA");
        _open(backer, m, r);
        vm.warp(block.timestamp + 30 days);

        uint256 pending = board.pendingSettlement(backer);
        assertGt(pending, 0, "nothing to settle");

        uint256 balBefore = backer.balance;
        address[] memory arr = new address[](1);
        arr[0] = backer;
        board.settle(arr);

        assertApproxEqAbs(backer.balance - balBefore, pending, 1e9, "backer did not receive ~pending ETH");
        assertEq(board.claimable(backer), 0, "claimable not cleared");
        assertApproxEqAbs(board.pendingSettlement(backer), 0, 1e9, "pending not reset after settle");
        _notJailed();
    }

    function test_settle_afterClose_paysRealizedClaimable() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);

        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.02 ether);
        address backer = _backer("backerA");
        _open(backer, m, r);
        vm.warp(block.timestamp + 20 days);

        vm.prank(backer);
        CFA.deleteFlow(ETHX, backer, address(board), ""); // close realizes accrual into claimable
        uint256 claim = board.claimable(backer);
        assertGt(claim, 0, "close did not realize accrual into claimable");
        assertEq(board.backerMarkee(backer), address(0), "backer not cleared on close");

        uint256 balBefore = backer.balance;
        address[] memory arr = new address[](1);
        arr[0] = backer;
        board.settle(arr);

        assertApproxEqAbs(backer.balance - balBefore, claim, 1e9, "settle did not pay realized claimable");
        assertEq(board.claimable(backer), 0, "claimable not cleared");
        _notJailed();
    }

    function test_settle_viaLiveRevNet() public {
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.02 ether);
        address backer = _backer("backerA");
        _open(backer, m, r);
        vm.warp(block.timestamp + 30 days);

        uint256 pending = board.pendingSettlement(backer);
        assertGt(pending, 0, "nothing to settle");

        uint256 ethxBefore = IERC20(address(ETHX)).balanceOf(address(board));
        address[] memory arr = new address[](1);
        arr[0] = backer;
        board.settle(arr); // routes through the live Juicebox terminal (project 152) on the fork

        assertEq(board.claimable(backer), 0, "claimable not cleared");
        uint256 ethxAfter = IERC20(address(ETHX)).balanceOf(address(board));
        assertApproxEqRel(ethxBefore - ethxAfter, pending, 2e16, "contract ETHx did not drop by ~settled amount");
        _notJailed();
    }

    // ─── Jail-safety / liquidation ──────────────────────────────────────────────

    bytes32 constant CFA_ID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");

    function _critical(address a) internal view returns (bool) {
        return ETHX.isAccountCriticalNow(a);
    }

    /// @dev Liquidate an insolvent backer's inbound stream as an unrelated third party. Goes through
    ///      the CFA's `deleteFlow` (the liquidation branch) directly — the CFAv1Forwarder would route
    ///      a third party to `deleteFlowByOperator` (ACL), which has no liquidation permission.
    function _liquidate(address backer) internal {
        ISuperfluid host = ISuperfluid(HOST);
        ISuperAgreement cfa = host.getAgreementClass(CFA_ID);
        bytes memory callData = abi.encodeWithSignature(
            "deleteFlow(address,address,address,bytes)", address(ETHX), backer, address(board), new bytes(0)
        );
        vm.prank(makeAddr("liquidator"));
        host.callAgreement(cfa, callData, new bytes(0));
    }

    /// @dev Open a backer with generous funding (so the stream opens cleanly), then strip its free
    ///      ETHx so only the locked stream buffer remains — it goes critical (liquidatable) within the
    ///      buffer period. Top-spot backers get no refund, so they CAN become insolvent (losers are
    ///      refunded ≈ net-zero and never do).
    function _openThenDrain(string memory name, address markee, int96 rate) internal returns (address who) {
        who = _backer(name);
        _open(who, markee, rate);
        vm.startPrank(who);
        IERC20(address(ETHX)).transfer(address(0xdEaD), IERC20(address(ETHX)).balanceOf(who));
        vm.stopPrank();
    }

    /// @notice A small top-spot backer goes insolvent and is force-closed by a third-party liquidator
    ///         while a well-funded co-backer keeps the contract solvent. The termination callback must
    ///         not jail the SuperApp, and the ranking/aggregate must self-correct.
    function test_liquidation_topBacker_withCobacker_jailSafe() public {
        address m = _newMarkee("m", "alpha");
        int96 rBig = _rate(0.1 ether);
        int96 rSmall = _rate(0.02 ether);
        address big = _backer("bigBacker");
        _open(big, m, rBig);
        address small = _openThenDrain("smallBacker", m, rSmall);
        assertEq(board.topMarkee(), m, "markee should be top");
        assertEq(board.aggregateRate(m), _r(rBig) + _r(rSmall), "aggregate != big+small");

        vm.warp(block.timestamp + 6 hours);
        assertTrue(_critical(small), "small backer should be liquidatable");
        assertFalse(_critical(big), "big backer must stay solvent");

        _liquidate(small); // third-party liquidation via the CFA delete path

        _notJailed();
        assertEq(board.backerMarkee(small), address(0), "liquidated backer not cleared");
        assertEq(board.aggregateRate(m), _r(rBig), "aggregate should drop to the surviving backer");
        assertEq(board.topRate(), _r(rBig), "topRate not corrected");
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream should continue at reduced rate");
    }

    /// @notice The harder case: the SOLE top backer goes insolvent (so the contract itself drains) and
    ///         is liquidated. The termination callback must still not jail the app.
    function test_liquidation_soleTopBacker_jailSafe() public {
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.05 ether);
        address small = _openThenDrain("soleBacker", m, r);
        assertEq(board.topMarkee(), m);

        vm.warp(block.timestamp + 10 hours); // past the contract's own buffer, so it is insolvent too
        assertTrue(_critical(small), "sole backer should be liquidatable");

        _liquidate(small);

        _notJailed();
        assertEq(board.backerMarkee(small), address(0), "backer not cleared");
        assertEq(board.aggregateRate(m), 0, "aggregate not cleared");
        assertEq(board.topRate(), 0, "topRate not cleared");
    }

    /// @notice Closing the last backer of a loser Markee exercises the refund-lowering termination path
    ///         (distributeFlow → 0 on a now-empty pool). Must be jail-safe.
    function test_close_lastLoserBacker_jailSafe() public {
        address top = _newMarkee("top", "alpha");
        address loser = _newMarkee("loser", "bravo");
        _open(_backer("topBacker"), top, _rate(0.1 ether));
        address loserBacker = _backer("loserBacker");
        _open(loserBacker, loser, _rate(0.02 ether));
        assertEq(board.topMarkee(), top, "well-funded markee should be top");
        assertEq(board.refundRate(loser), board.aggregateRate(loser), "loser should be refunded at its aggregate");

        vm.prank(loserBacker);
        CFA.deleteFlow(ETHX, loserBacker, address(board), "");

        _notJailed();
        assertEq(board.aggregateRate(loser), 0, "loser aggregate not cleared");
        assertEq(board.refundRate(loser), 0, "refund not stopped after last loser backer left");
        assertEq(board.backerMarkee(loserBacker), address(0), "loser backer not cleared");
    }

    /// @notice If the beneficiary force-closes the contract's outflow to itself, a later top-backer
    ///         termination must NOT try to re-create that stream inside the no-revert callback (a
    ///         create can revert on buffer → jail). The flow is restored later by the syncMarkee poke.
    function test_beneficiaryClosesOutflow_thenTermination_jailSafe() public {
        address m = _newMarkee("m", "alpha");
        int96 r1 = _rate(0.05 ether);
        int96 r2 = _rate(0.03 ether);
        address b1 = _backer("b1");
        address b2 = _backer("b2");
        _open(b1, m, r1);
        _open(b2, m, r2);
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream should be open");

        // A receiver may delete its own inbound flow: beneficiary closes the contract's outflow.
        vm.prank(beneficiary);
        CFA.deleteFlow(ETHX, address(board), beneficiary, "");
        assertEq(_beneficiaryFlow(), int96(0), "beneficiary stream should be closed");

        // A top backer now closes — the termination callback must stay jail-safe (no re-create).
        vm.prank(b2);
        CFA.deleteFlow(ETHX, b2, address(board), "");
        _notJailed();
        assertEq(board.aggregateRate(m), _r(r1), "aggregate should drop to the remaining backer");
        assertEq(_beneficiaryFlow(), int96(0), "termination must not re-create the beneficiary stream");

        // The deferred beneficiary stream is restored by the permissionless poke.
        board.syncMarkee(m);
        _notJailed();
        int96 expected = int96(int256(_r(r1) * factory.percentToBeneficiary() / BPS));
        assertEq(_beneficiaryFlow(), expected, "syncMarkee should restore the beneficiary stream");
    }

    /// @notice Full cross-contract migration-in handoff: a Markee living on a legacy v1.3 lump-sum
    ///         Leaderboard is re-pointed to the streaming board (preserving its address), registered
    ///         here, and is then fully live for streaming. Exercises the real two-step flow —
    ///         legacy `migratePricingStrategy` → streaming `registerExistingMarkees` — and the
    ///         `pricingStrategy == this` invariant the registration now enforces.
    function test_migrationIn_fullHandoff_fromLegacyLeaderboard() public {
        // 1. Stand up a legacy v1.3 leaderboard on the same fork.
        LeaderboardFactory legacyFactory =
            new LeaderboardFactory("Legacy", "legacy", REVNET_TERMINAL, REVNET_PROJECT, address(0), admin);
        (address legacyBoardAddr,) = legacyFactory.createLeaderboard(beneficiary, "Legacy Board");
        Leaderboard legacyBoard = Leaderboard(legacyBoardAddr); // legacy admin == this test contract

        // 2. Create a real, paid Markee on the legacy leaderboard (lump-sum model routes via Markee.pay).
        address creator = makeAddr("legacyCreator");
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        address markee = legacyBoard.createMarkee{value: 0.01 ether}("legacy msg", "legacyName");
        assertEq(IMarkee(markee).pricingStrategy(), legacyBoardAddr, "markee should start on the legacy board");

        // 3. Hand it off: the legacy board re-points the Markee's strategy to the streaming board.
        legacyBoard.migratePricingStrategy(markee, address(board));
        assertEq(IMarkee(markee).pricingStrategy(), address(board), "markee not re-pointed to streaming board");

        // 4. The streaming board registers it — same address, fresh GDA pool. The pricingStrategy
        //    invariant now gates this (a non-handed-off address would revert here).
        address[] memory arr = new address[](1);
        arr[0] = markee;
        board.registerExistingMarkees(arr);
        assertTrue(board.isMarkeeOnLeaderboard(markee), "migrated markee not registered on streaming board");
        assertTrue(address(board.poolOf(markee)) != address(0), "no GDA pool created for migrated markee");

        // 5. The migrated Markee is fully live: a backer can stream into it and it ranks #1.
        address backer = _backer("backerA");
        _open(backer, markee, _rate(0.03 ether));
        assertEq(board.topMarkee(), markee, "migrated markee should rank once backed");
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream should open for the migrated markee");
        _notJailed();
    }

    /// @notice registerExistingMarkees rejects an address that has NOT been handed off to this strategy
    ///         (its pricingStrategy still points elsewhere) — prevents registering half-migrated Markees.
    function test_registerExistingMarkees_rejectsNotHandedOff() public {
        LeaderboardFactory legacyFactory =
            new LeaderboardFactory("Legacy", "legacy", REVNET_TERMINAL, REVNET_PROJECT, address(0), admin);
        (address legacyBoardAddr,) = legacyFactory.createLeaderboard(beneficiary, "Legacy Board");

        address creator = makeAddr("legacyCreator");
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        address markee = Leaderboard(legacyBoardAddr).createMarkee{value: 0.01 ether}("m", "n");

        // Still on the legacy board (no migratePricingStrategy call) → registration must revert.
        address[] memory arr = new address[](1);
        arr[0] = markee;
        vm.expectRevert("Markee not migrated to this strategy");
        board.registerExistingMarkees(arr);
    }

    // ─── Migration-out (_vacateTopIf + refund wind-down) ────────────────────────

    /// @notice Migrating the current #1 to another strategy must vacate the top (no auto-promotion),
    ///         stop the beneficiary stream, and freeze the settlement accumulator — all without
    ///         jailing the app. The departed Markee's backer can still settle what accrued while #1
    ///         and reclaim its full deposit after closing its own stream.
    function test_migrationOut_topMarkee_vacatesTop() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);

        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.03 ether);
        address backer = _backer("backerA");
        _open(backer, m, r);
        assertEq(board.topMarkee(), m, "markee should be top");
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream should be open");

        vm.warp(block.timestamp + 10 days);
        uint256 pendingBefore = board.pendingSettlement(backer);
        assertGt(pendingBefore, 0, "backer should have accrued while #1");

        address newStrategy = makeAddr("newStrategy");
        board.migratePricingStrategy(m, newStrategy); // board admin == this test contract

        assertEq(board.topMarkee(), address(0), "top not vacated");
        assertEq(board.topRate(), 0, "topRate not cleared");
        assertEq(_beneficiaryFlow(), int96(0), "beneficiary stream not stopped on migration-out");
        assertFalse(board.isMarkeeOnLeaderboard(m), "markee still registered after migration-out");
        assertEq(IMarkee(m).pricingStrategy(), newStrategy, "Markee strategy not switched");
        _notJailed();

        // Accumulator frozen: no further accrual once the Markee leaves #1.
        vm.warp(block.timestamp + 10 days);
        assertApproxEqAbs(board.pendingSettlement(backer), pendingBefore, 1e9, "accrual must freeze after migration-out");

        // The frozen reward is still settleable.
        uint256 balBefore = backer.balance;
        address[] memory arr = new address[](1);
        arr[0] = backer;
        board.settle(arr);
        assertApproxEqAbs(backer.balance - balBefore, pendingBefore, 1e9, "frozen reward not settled");

        // Backer closes its now-unbacked stream (jail-safe) and reclaims its full deposit.
        vm.prank(backer);
        CFA.deleteFlow(ETHX, backer, address(board), "");
        _notJailed();
        uint256 deposit = board.backerDeposit(backer);
        assertEq(deposit, uint256(uint96(r)) * BUFFER_PERIOD, "deposit changed unexpectedly");
        uint256 ethxBefore = IERC20(address(ETHX)).balanceOf(backer);
        vm.prank(backer);
        board.withdrawDeposit();
        assertEq(IERC20(address(ETHX)).balanceOf(backer) - ethxBefore, deposit, "deposit not fully refunded");
    }

    /// @notice Migrating a non-#1 Markee out winds down its refund flow to 0 and leaves the current
    ///         #1 (and its beneficiary stream) untouched. The departed Markee's backer can still close
    ///         and reclaim its deposit.
    function test_migrationOut_loserMarkee_windsDownRefund() public {
        address top = _newMarkee("top", "alpha");
        address loser = _newMarkee("loser", "bravo");
        _open(_backer("topBacker"), top, _rate(0.1 ether));
        address loserBacker = _backer("loserBacker");
        _open(loserBacker, loser, _rate(0.02 ether));
        assertEq(board.topMarkee(), top, "well-funded markee should be top");
        assertEq(board.refundRate(loser), board.aggregateRate(loser), "loser refunded at its aggregate");

        address newStrategy = makeAddr("newStrategy");
        board.migratePricingStrategy(loser, newStrategy);

        assertEq(board.refundRate(loser), 0, "refund not wound down on migration-out");
        assertFalse(board.isMarkeeOnLeaderboard(loser), "loser still registered");
        assertEq(board.topMarkee(), top, "top must be unaffected by a loser leaving");
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream must continue");
        _notJailed();

        vm.prank(loserBacker);
        CFA.deleteFlow(ETHX, loserBacker, address(board), "");
        _notJailed();
        uint256 deposit = board.backerDeposit(loserBacker);
        uint256 ethxBefore = IERC20(address(ETHX)).balanceOf(loserBacker);
        vm.prank(loserBacker);
        board.withdrawDeposit();
        assertEq(IERC20(address(ETHX)).balanceOf(loserBacker) - ethxBefore, deposit, "deposit not fully refunded");
    }

    // ─── Deposit / buffer accounting reconciliation ─────────────────────────────

    /// @notice The deposit gate is exactly `rate * BUFFER_PERIOD`: one wei short is rejected, the exact
    ///         amount is accepted. Pins the size of the refundable buffer cover a backer must pre-post.
    function test_depositBoundary_exactlyCoversBuffer() public {
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.02 ether);
        uint256 required = uint256(uint96(r)) * BUFFER_PERIOD;

        address shy = _backer("shy");
        vm.startPrank(shy);
        board.depositBuffer(required - 1);
        GDA.connectPool(board.poolOf(m), "");
        vm.expectRevert();
        CFA.createFlow(ETHX, shy, address(board), r, abi.encode(m));
        vm.stopPrank();

        address exact = _backer("exact");
        vm.startPrank(exact);
        board.depositBuffer(required);
        GDA.connectPool(board.poolOf(m), "");
        CFA.createFlow(ETHX, exact, address(board), r, abi.encode(m));
        vm.stopPrank();
        assertEq(board.backerMarkee(exact), m, "exact-buffer deposit should be accepted");
        _notJailed();
    }

    /// @notice A decay-driven `claimTop` flip is NOT inside a flow callback, so it cannot lean on
    ///         Superfluid app credit to fund the old top's refund buffer — it must come from the
    ///         contract's deposit reserve. Assert the raised refund flow is actually streaming at the
    ///         Markee's aggregate and the contract stays solvent (available balance ≥ 0).
    function test_claimTop_fundsOldTopRefundBufferFromReserve() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");
        address backerA = _backer("backerA");
        address backerB = _backer("backerB");
        _open(backerA, a, _rate(0.05 ether)); // A top, not refunded
        _open(backerB, b, _rate(0.03 ether)); // B loser, refunded at its aggregate
        assertEq(board.topMarkee(), a);

        // A decays below B (still stale-top — decay fires no promotion callback).
        vm.prank(backerA);
        CFA.updateFlow(ETHX, backerA, address(board), _rate(0.01 ether), abi.encode(a));
        assertLt(board.aggregateRate(a), board.aggregateRate(b), "A should now be below B");

        board.claimTop(b);
        assertEq(board.topMarkee(), b, "claimTop did not flip");
        _notJailed();

        // A is now a loser: its refund distribute flow must actually be live at its aggregate, which
        // means the contract funded the buffer from reserve (no app credit available outside callbacks).
        assertEq(board.refundRate(a), board.aggregateRate(a), "A refund rate not raised to its aggregate");
        assertApproxEqAbs(
            uint256(uint96(board.poolOf(a).getTotalFlowRate())),
            board.aggregateRate(a),
            2,
            "A refund distribute flow not actually streaming"
        );
        (int256 avail,,,) = ETHX.realtimeBalanceOfNow(address(board));
        assertGe(avail, int256(0), "contract went insolvent funding the refund buffer from reserve");
    }

    /// @notice The core reconciliation: across opens, an auto-flip, and lazy closes in any order, no
    ///         backer's `rate * BUFFER_PERIOD` deposit is ever consumed or stranded — every backer
    ///         reclaims its full deposit after closing, and the app never jails. The 38% RevNet surplus
    ///         on the #1 spot is what keeps the contract's free balance ahead of its outbound buffers.
    function test_deposits_fullyRefundable_afterLifecycle() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);

        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");
        int96 ra1 = _rate(0.02 ether);
        int96 ra2 = _rate(0.03 ether);
        int96 rb = _rate(0.06 ether);
        address[3] memory backers = [_backer("a1"), _backer("a2"), _backer("b1")];
        int96[3] memory rates = [ra1, ra2, rb];

        _open(backers[0], a, ra1); // A top
        _open(backers[1], a, ra2); // A grows, still top
        _open(backers[2], b, rb); // B overtakes A → auto-flip in the inflow callback
        assertEq(board.topMarkee(), b, "B should be top after overtake");

        vm.warp(block.timestamp + 5 days);

        for (uint256 i = 0; i < 3; i++) {
            address who = backers[i];
            vm.prank(who);
            CFA.deleteFlow(ETHX, who, address(board), "");
            _notJailed();

            uint256 deposit = board.backerDeposit(who);
            assertEq(deposit, uint256(uint96(rates[i])) * BUFFER_PERIOD, "deposit changed unexpectedly");
            uint256 ethxBefore = IERC20(address(ETHX)).balanceOf(who);
            vm.prank(who);
            board.withdrawDeposit();
            assertEq(IERC20(address(ETHX)).balanceOf(who) - ethxBefore, deposit, "deposit not fully refundable");
        }
        _notJailed();
    }

    /// @notice Outbound flow buffers must be funded by backer DEPOSITS, never by the 38% RevNet money
    ///         owed to backers (that ETHx belongs to them and must stay claimable). Prove it the hard
    ///         way: drain every wei of RevNet accrual out of the contract via settle, then show all
    ///         buffers are still funded (app not jailed, beneficiary + loser-refund flows live), the
    ///         contract is solvent on deposits alone (availableBalance ≥ 0), and every deposit is still
    ///         fully refundable. The cushion that makes this hold is the DEPOSIT surplus: the top
    ///         Markee's backers post `rate*BUFFER` but the contract only locks 0.62*rate*BUFFER for the
    ///         beneficiary stream, so deposits alone exceed all outbound buffers by 0.38*topRate*BUFFER.
    function test_buffersDoNotRelyOnRevNetMoney() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false); // settle pays ETH directly → clean, total drain

        address top = _newMarkee("top", "alpha");
        address loser = _newMarkee("loser", "bravo");
        address topBacker = _backer("topBacker");
        address loserBacker = _backer("loserBacker");
        _open(topBacker, top, _rate(0.1 ether));
        _open(loserBacker, loser, _rate(0.04 ether));
        assertEq(board.topMarkee(), top, "well-funded markee should be top");

        vm.warp(block.timestamp + 30 days);

        // Drain ALL RevNet money out of the contract.
        address[] memory all = new address[](2);
        all[0] = topBacker;
        all[1] = loserBacker;
        board.settle(all);
        assertApproxEqAbs(board.pendingSettlement(topBacker), 0, 1e9, "top RevNet not drained");
        assertApproxEqAbs(board.pendingSettlement(loserBacker), 0, 1e9, "loser RevNet not drained");

        // With zero RevNet money left, every buffer must still be funded.
        _notJailed();
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary buffer lost after draining RevNet");
        assertApproxEqAbs(
            uint256(uint96(board.poolOf(loser).getTotalFlowRate())),
            board.aggregateRate(loser),
            2,
            "loser refund buffer lost after draining RevNet"
        );

        // Solvent on deposits alone.
        (int256 avail,,,) = ETHX.realtimeBalanceOfNow(address(board));
        assertGe(avail, int256(0), "contract insolvent on deposits alone after draining RevNet");

        // Every deposit still fully refundable after close.
        address[2] memory backers = [topBacker, loserBacker];
        for (uint256 i = 0; i < 2; i++) {
            address who = backers[i];
            vm.prank(who);
            CFA.deleteFlow(ETHX, who, address(board), "");
            _notJailed();
            uint256 deposit = board.backerDeposit(who);
            uint256 ethxBefore = IERC20(address(ETHX)).balanceOf(who);
            vm.prank(who);
            board.withdrawDeposit();
            assertEq(IERC20(address(ETHX)).balanceOf(who) - ethxBefore, deposit, "deposit not refundable on deposits alone");
        }
    }

    /// @notice Raising a stream rate must require the deposit to cover the NEW rate's buffer — otherwise
    ///         the larger refund/beneficiary buffer would be under-collateralized. A decrease never needs
    ///         a top-up (the existing deposit already covers the smaller rate).
    function test_updateUp_requiresAdditionalDeposit() public {
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.02 ether);
        address backer = _backer("backerA");
        _open(backer, m, r); // deposits exactly r * BUFFER_PERIOD

        int96 rUp = _rate(0.05 ether);
        vm.prank(backer);
        vm.expectRevert();
        CFA.updateFlow(ETHX, backer, address(board), rUp, "");

        uint256 topUp = uint256(uint96(rUp)) * BUFFER_PERIOD - board.backerDeposit(backer);
        vm.startPrank(backer);
        board.depositBuffer(topUp);
        CFA.updateFlow(ETHX, backer, address(board), rUp, "");
        vm.stopPrank();
        assertEq(board.aggregateRate(m), uint256(uint96(rUp)), "rate not raised after deposit top-up");
        _notJailed();
    }

    /// @notice Changing the beneficiary must close the old outflow (else it streams the contract's ETHx
    ///         to the old beneficiary forever) and open the stream to the new one at the same top rate.
    function test_setBeneficiaryAddress_migratesStream() public {
        address m = _newMarkee("m", "alpha");
        address backer = _backer("backerA");
        _open(backer, m, _rate(0.05 ether));
        int96 oldFlow = _beneficiaryFlow();
        assertGt(oldFlow, int96(0), "beneficiary stream should be open");

        address newBeneficiary = makeAddr("newBeneficiary");
        board.setBeneficiaryAddress(newBeneficiary); // board admin == this test contract

        assertEq(_beneficiaryFlow(), int96(0), "old beneficiary stream not closed");
        assertEq(
            CFA.getFlowrate(ETHX, address(board), newBeneficiary),
            oldFlow,
            "new beneficiary stream not opened at the top rate"
        );
        _notJailed();
    }
}
