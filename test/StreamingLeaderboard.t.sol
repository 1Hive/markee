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

import { StreamingLeaderboardFactory } from "../contracts/v1.3/streaming/StreamingLeaderboardFactory.sol";
import { StreamingLeaderboard } from "../contracts/v1.3/streaming/StreamingLeaderboard.sol";
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
    function owner() external view returns (address);
    function setPricingStrategy(address newStrategy) external;
    function totalFundsAdded() external view returns (uint256);
}

interface IPermitToken {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
    function nonces(address owner) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

interface ICFAv1Agreement {
    function createFlow(ISuperToken token, address receiver, int96 flowRate, bytes calldata ctx)
        external returns (bytes memory);
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
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

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
        board.depositBuffer(who, deposit);
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
    ///         create can revert on buffer → jail). The beneficiary renounced it (no one loses money),
    ///         and the stream self-heals on the next organic flow event on the #1 Markee.
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

        // The next organic flow event on the #1 Markee re-creates the deferred beneficiary stream.
        int96 r3 = _rate(0.04 ether);
        _open(_backer("b3"), m, r3);
        _notJailed();
        int96 expected = int96(int256(_r(r1 + r3) * factory.percentToBeneficiary() / BPS));
        assertEq(_beneficiaryFlow(), expected, "next organic bid should restore the beneficiary stream");
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

    // ─── Legacy grandfather floor (migrated lump-sum spots hold #1 until overtaken) ──

    /// @dev Stand up a fresh legacy v1.3 board, create a paid Markee on it, hand it off to the streaming
    ///      board, and register it — the real migration path. Returns the (address-preserved) Markee.
    function _migrateInPaidMarkee(uint256 payWei, string memory salt) internal returns (address markee) {
        LeaderboardFactory legacyFactory =
            new LeaderboardFactory("Legacy", "legacy", REVNET_TERMINAL, REVNET_PROJECT, address(0), admin);
        (address legacyBoardAddr,) = legacyFactory.createLeaderboard(beneficiary, "Legacy Board");
        Leaderboard legacyBoard = Leaderboard(legacyBoardAddr); // legacy admin == this test contract

        address creator = makeAddr(string.concat("legacyCreator-", salt));
        vm.deal(creator, 10 ether);
        vm.prank(creator);
        markee = legacyBoard.createMarkee{value: payWei}("legacy", salt);

        legacyBoard.migratePricingStrategy(markee, address(board));
        address[] memory arr = new address[](1);
        arr[0] = markee;
        board.registerExistingMarkees(arr); // streaming board admin == this test contract
    }

    /// @notice The customer requirement: a migrated lump-sum Markee with no stream holds #1, a stream
    ///         BELOW its grandfather floor does not overtake it (and is refunded as a loser), and a
    ///         stream ABOVE the floor does overtake it and starts paying the beneficiary.
    function test_legacyFloor_holdsTopUntilStreamOvertakes() public {
        address L = _migrateInPaidMarkee(0.03 ether, "L");
        assertEq(board.topMarkee(), L, "migrated legacy markee should hold #1 by its floor");
        assertGt(board.legacyFloorRate0(L), 0, "legacy floor not captured at migration");
        assertEq(_beneficiaryFlow(), int96(0), "a pre-paid legacy top must not open a beneficiary stream");

        uint256 floorMonthly = board.currentLegacyFloor(L) * SECONDS_IN_MONTH;
        assertGt(floorMonthly, 0, "no live floor");

        // A stream below the floor does NOT overtake — legacy keeps #1, the streamer is a refunded loser.
        address low = _newMarkee("low", "low");
        _open(_backer("bLow"), low, _rate(floorMonthly / 2));
        assertEq(board.topMarkee(), L, "sub-floor stream must not overtake the legacy spot");
        assertEq(board.refundRate(low), board.aggregateRate(low), "sub-floor streamer should be refunded (loser)");
        assertEq(_beneficiaryFlow(), int96(0), "no beneficiary stream while the legacy spot still holds #1");

        // A stream above the floor overtakes — it becomes #1 and starts paying the beneficiary.
        address high = _newMarkee("high", "high");
        _open(_backer("bHigh"), high, _rate(floorMonthly * 2));
        assertEq(board.topMarkee(), high, "above-floor stream should overtake the legacy spot");
        int96 expected = int96(int256(board.aggregateRate(high) * factory.percentToBeneficiary() / BPS));
        assertEq(_beneficiaryFlow(), expected, "beneficiary stream should open at 62% once a stream wins");
        _notJailed();
    }

    /// @notice With decay enabled, a sub-floor streamer waits below the (still-high) floor, then takes
    ///         #1 via the permissionless claimTop poke once the floor decays past it — the same decay
    ///         mechanism streaming uses, so grandfathered spots eventually convert to recurring revenue.
    function test_legacyFloor_decaysThenStreamOvertakes() public {
        address L = _migrateInPaidMarkee(0.03 ether, "L");
        assertEq(board.topMarkee(), L);
        uint256 floorMonthly = board.currentLegacyFloor(L) * SECONDS_IN_MONTH;

        board.setLegacyFloorConfig(3, 0, 30 days); // K=3, no grace, 30-day linear decay

        address s = _newMarkee("s", "s");
        _open(_backer("bs"), s, _rate(floorMonthly / 2)); // sub-floor → waits
        assertEq(board.topMarkee(), L, "sub-floor streamer must wait while the floor is high");
        assertEq(_beneficiaryFlow(), int96(0), "no beneficiary stream while legacy still holds");

        vm.warp(block.timestamp + 31 days);
        assertEq(board.currentLegacyFloor(L), 0, "floor should have fully decayed");

        board.claimTop(s);
        assertEq(board.topMarkee(), s, "streamer should take #1 after the legacy floor decays");
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream opens once the streamer wins");
        _notJailed();
    }

    /// @notice Migrating several legacy Markees seeds #1 to the highest lump-sum total, regardless of
    ///         registration order.
    function test_legacyFloor_higherTotalSeedsTop() public {
        address small = _migrateInPaidMarkee(0.01 ether, "small");
        assertEq(board.topMarkee(), small, "first migrated markee seeds #1");
        address big = _migrateInPaidMarkee(0.05 ether, "big");
        assertEq(board.topMarkee(), big, "higher-total migrated markee should take #1");
        assertGt(board.legacyFloorRate0(big), board.legacyFloorRate0(small), "floor should scale with total");
        _notJailed();
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

    /// @notice Migrating a non-#1 Markee out KEEPS refunding its backers at their full aggregate so they
    ///         stay net-zero while they close lazily (no stranded principal). The refund winds down and
    ///         the per-Markee state is cleared once the last backer closes; the current #1 (and its
    ///         beneficiary stream) is untouched throughout.
    function test_migrationOut_loserMarkee_keepsRefundUntilBackerCloses() public {
        address top = _newMarkee("top", "alpha");
        address loser = _newMarkee("loser", "bravo");
        _open(_backer("topBacker"), top, _rate(0.1 ether));
        address loserBacker = _backer("loserBacker");
        _open(loserBacker, loser, _rate(0.02 ether));
        assertEq(board.topMarkee(), top, "well-funded markee should be top");
        assertEq(board.refundRate(loser), board.aggregateRate(loser), "loser refunded at its aggregate");

        address newStrategy = makeAddr("newStrategy");
        board.migratePricingStrategy(loser, newStrategy);

        // Refund is KEPT at the aggregate so the departing backer keeps netting ~zero until it closes.
        assertEq(board.refundRate(loser), board.aggregateRate(loser), "departing backer must stay refunded");
        assertFalse(board.isMarkeeOnLeaderboard(loser), "loser still registered");
        assertEq(board.topMarkee(), top, "top must be unaffected by a loser leaving");
        assertGt(_beneficiaryFlow(), int96(0), "beneficiary stream must continue");
        vm.warp(block.timestamp + 5 days);
        _notJailed();

        vm.prank(loserBacker);
        CFA.deleteFlow(ETHX, loserBacker, address(board), "");
        _notJailed();
        // Once the last backer closes, the refund winds to 0 and per-Markee state is cleared so the
        // Markee can be cleanly re-registered later.
        assertEq(board.refundRate(loser), 0, "refund not wound down after last backer closed");
        assertEq(address(board.poolOf(loser)), address(0), "pool not cleared after wind-down");
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
        board.depositBuffer(shy, required - 1);
        GDA.connectPool(board.poolOf(m), "");
        vm.expectRevert();
        CFA.createFlow(ETHX, shy, address(board), r, abi.encode(m));
        vm.stopPrank();

        address exact = _backer("exact");
        vm.startPrank(exact);
        board.depositBuffer(exact, required);
        GDA.connectPool(board.poolOf(m), "");
        CFA.createFlow(ETHX, exact, address(board), r, abi.encode(m));
        vm.stopPrank();
        assertEq(board.backerMarkee(exact), m, "exact-buffer deposit should be accepted");
        _notJailed();
    }

    /// @notice depositBuffer pulls from and credits the explicit `backer`, not msg.sender, so the
    ///         frontend can bundle it into the host.batchCall whose forwarded sender is the host. A
    ///         third-party caller moves only funds the backer itself approved, crediting the backer.
    function test_depositBuffer_creditsExplicitBackerNotCaller() public {
        address bob = _backer("bob");
        uint256 amount = uint256(uint96(_rate(0.02 ether))) * BUFFER_PERIOD;
        uint256 bobBefore = IERC20(address(ETHX)).balanceOf(bob);

        vm.prank(makeAddr("relayer"));
        board.depositBuffer(bob, amount);

        assertEq(board.backerDeposit(bob), amount, "deposit must credit the backer");
        assertEq(board.backerDeposit(makeAddr("relayer")), 0, "caller must not be credited");
        assertEq(bobBefore - IERC20(address(ETHX)).balanceOf(bob), amount, "funds must come from the backer");
    }

    /// @notice The frontend's single-tx open, built from native ETH with no pre-wrap and no pre-approval:
    ///         one payable host.batchCall of wrap → permit → depositBuffer → createFlow. Verifies the
    ///         three things the design hinges on: (1) msg.value routes only to the value-bearing wrap
    ///         (each SIMPLE_FORWARD_CALL forwards the host's whole balance, which the wrap drains to 0,
    ///         so the value-0 depositBuffer forward-call does not revert), (2) depositBuffer credits the
    ///         explicit backer even though the forwarded sender is Superfluid's SimpleForwarder, and
    ///         (3) the buffer allowance is authorized in-batch via EIP-2612 permit, since this Superfluid
    ///         version has no ERC20-approve batch op.
    function test_batchCall_singleTxOpensStream_fromNativeEth() public {
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.05 ether);
        uint256 buffer = uint256(uint96(r)) * BUFFER_PERIOD;
        uint256 wrapAmount = 1 ether + buffer;

        (address backer, uint256 pk) = makeAddrAndKey("batchBacker");
        vm.deal(backer, wrapAmount);

        ISuperfluid.Operation[] memory ops = new ISuperfluid.Operation[](4);

        ops[0] = ISuperfluid.Operation({
            operationType: uint32(301), // SIMPLE_FORWARD_CALL, carries the whole msg.value
            target: address(ETHX),
            data: abi.encodeWithSignature("upgradeByETHTo(address)", backer)
        });

        {
            uint256 deadline = block.timestamp + 1 hours;
            bytes32 structHash = keccak256(
                abi.encode(
                    PERMIT_TYPEHASH, backer, address(board), buffer, IPermitToken(address(ETHX)).nonces(backer), deadline
                )
            );
            bytes32 digest =
                keccak256(abi.encodePacked("\x19\x01", IPermitToken(address(ETHX)).DOMAIN_SEPARATOR(), structHash));
            (uint8 v, bytes32 sr, bytes32 ss) = vm.sign(pk, digest);
            ops[1] = ISuperfluid.Operation({
                operationType: uint32(301),
                target: address(ETHX),
                data: abi.encodeWithSelector(
                    IPermitToken.permit.selector, backer, address(board), buffer, deadline, v, sr, ss
                )
            });
        }

        ops[2] = ISuperfluid.Operation({
            operationType: uint32(301),
            target: address(board),
            data: abi.encodeWithSelector(StreamingLeaderboard.depositBuffer.selector, backer, buffer)
        });

        {
            address cfa = address(
                ISuperfluid(HOST).getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))
            );
            bytes memory callData =
                abi.encodeWithSelector(ICFAv1Agreement.createFlow.selector, ETHX, address(board), r, new bytes(0));
            ops[3] = ISuperfluid.Operation({
                operationType: uint32(201), // SUPERFLUID_CALL_AGREEMENT, preserves backer as the flow sender
                target: cfa,
                data: abi.encode(callData, abi.encode(m))
            });
        }

        vm.prank(backer);
        ISuperfluid(HOST).batchCall{value: wrapAmount}(ops);

        assertEq(board.backerDeposit(backer), buffer, "buffer not credited to the explicit backer in-batch");
        assertEq(board.backerMarkee(backer), m, "stream not opened to the markee");
        assertEq(board.aggregateRate(m), uint256(uint96(r)), "aggregate rate mismatch");
        assertEq(board.topMarkee(), m, "first backer's markee should be #1");
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
        board.depositBuffer(backer, topUp);
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

    // ─── Regression tests for the security-review fixes ─────────────────────────

    function _fundApprove(address who, address spender) internal {
        vm.deal(who, 100 ether);
        vm.startPrank(who);
        ISETH(address(ETHX)).upgradeByETH{value: 50 ether}();
        IERC20(address(ETHX)).approve(spender, type(uint256).max);
        vm.stopPrank();
    }

    function _openOn(StreamingLeaderboard bd, address who, address markee, int96 rate) internal {
        uint256 deposit = uint256(uint96(rate)) * BUFFER_PERIOD;
        vm.startPrank(who);
        bd.depositBuffer(who, deposit);
        GDA.connectPool(bd.poolOf(markee), "");
        CFA.createFlow(ETHX, who, address(bd), rate, abi.encode(markee));
        vm.stopPrank();
    }

    /// @notice A backer of a migrated-out Markee that raises its flow must NOT re-promote the departed
    ///         Markee back to #1 (onFlowUpdated guards on isMarkeeOnLeaderboard).
    function test_onFlowUpdated_cannotRepromoteDepartedMarkee() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);
        address top = _newMarkee("top", "alpha");
        address dep = _newMarkee("dep", "bravo");
        _open(_backer("topBacker"), top, _rate(0.1 ether));
        address depBacker = _backer("depBacker");
        _open(depBacker, dep, _rate(0.02 ether));
        assertEq(board.topMarkee(), top);

        board.migratePricingStrategy(dep, makeAddr("newStrategy"));
        assertFalse(board.isMarkeeOnLeaderboard(dep), "dep should be off the board");

        int96 huge = _rate(1 ether);
        vm.startPrank(depBacker);
        board.depositBuffer(depBacker, uint256(uint96(huge)) * BUFFER_PERIOD);
        CFA.updateFlow(ETHX, depBacker, address(board), huge, abi.encode(dep));
        vm.stopPrank();

        assertEq(board.topMarkee(), top, "departed Markee was re-promoted to #1");
        _notJailed();
    }

    /// @notice Re-registering a Markee that left while backers were still streaming must revert rather
    ///         than reuse stale per-Markee state against a fresh empty pool.
    function test_reRegisterWhileWindingDown_reverts() public {
        address top = _newMarkee("top", "alpha");
        address dep = _newMarkee("dep", "bravo");
        _open(_backer("topBacker"), top, _rate(0.1 ether));
        _open(_backer("depBacker"), dep, _rate(0.02 ether));

        StubStrategy stub = new StubStrategy();
        board.migratePricingStrategy(dep, address(stub));
        stub.repoint(dep, address(board));
        assertEq(IMarkee(dep).pricingStrategy(), address(board));

        address[] memory arr = new address[](1);
        arr[0] = dep;
        vm.expectRevert(bytes("Markee still winding down"));
        board.registerExistingMarkees(arr);
    }

    /// @notice With a drained/critical top backer present, closing one of a loser's several backers
    ///         exercises the positive-rate refund LOWERING in the no-revert termination callback. It must
    ///         stay jail-safe and, while the board itself is solvent, the refund tracks the remaining
    ///         aggregate. (The deferral guard added for the deep-insolvency edge is defense-in-depth: the
    ///         deposit-surplus invariant keeps the board net-positive, so a negative board balance is not
    ///         reachable through normal flows.)
    function test_drainedTop_loserPartialClose_jailSafe() public {
        address top = _newMarkee("top", "alpha");
        address loser = _newMarkee("loser", "bravo");
        address drainedTop = _openThenDrain("topBackerDrained", top, _rate(0.1 ether));
        address l1 = _backer("loserOne");
        address l2 = _backer("loserTwo");
        _open(l1, loser, _rate(0.02 ether));
        _open(l2, loser, _rate(0.02 ether));
        assertEq(board.topMarkee(), top);
        assertEq(board.refundRate(loser), board.aggregateRate(loser), "loser refunded at aggregate");

        vm.warp(block.timestamp + 12 hours);
        assertTrue(_critical(drainedTop), "drained top backer should be critical");

        vm.prank(l1);
        CFA.deleteFlow(ETHX, l1, address(board), "");
        _notJailed();
        assertEq(board.refundRate(loser), board.aggregateRate(loser), "refund should track the remaining aggregate");
    }

    /// @notice Lowering percentToBeneficiary after a long accrual window must NOT retroactively
    ///         over-credit backers (accrual tracks the actual beneficiary outflow, not the live percent),
    ///         so settle stays solvent.
    function test_percentChange_noRetroactiveOverCredit() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);
        address m = _newMarkee("m", "alpha");
        address backer = _backer("pctBacker");
        _open(backer, m, _rate(0.1 ether));
        vm.warp(block.timestamp + 30 days);

        uint256 pendingBefore = board.pendingSettlement(backer);
        assertGt(pendingBefore, 0, "nothing accrued");

        vm.prank(admin);
        factory.setPercentToBeneficiary(3000); // lower the beneficiary share

        uint256 pendingAfter = board.pendingSettlement(backer);
        assertApproxEqAbs(pendingAfter, pendingBefore, 1e9, "percent change retroactively re-priced accrual");

        uint256 balBefore = backer.balance;
        address[] memory arr = new address[](1);
        arr[0] = backer;
        board.settle(arr);
        assertApproxEqAbs(backer.balance - balBefore, pendingBefore, 1e9, "settle paid the wrong amount");
        assertFalse(_critical(address(board)), "settle over-downgraded and made the contract insolvent");
        _notJailed();
    }

    /// @notice One recipient that rejects ETH must not brick a settle batch: its amount is re-wrapped and
    ///         its claimable restored, leaving the contract solvent and unjailed.
    function test_settle_isolatesRevertingRecipient() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);
        address m = _newMarkee("m", "alpha");
        int96 r = _rate(0.05 ether);

        BadBacker bad = new BadBacker();
        vm.deal(address(this), 100 ether);
        bad.setup{value: 50 ether}(CFA, GDA, ETHX, board, m, r, uint256(uint96(r)) * BUFFER_PERIOD);
        assertEq(board.backerMarkee(address(bad)), m, "bad backer not opened");

        vm.warp(block.timestamp + 20 days);
        assertGt(board.pendingSettlement(address(bad)), 0, "bad backer should have accrued");

        uint256 ethxBoardBefore = IERC20(address(ETHX)).balanceOf(address(board));
        address[] memory arr = new address[](1);
        arr[0] = address(bad);
        board.settle(arr);

        assertGt(board.claimable(address(bad)), 0, "claimable not restored after the failed send");
        assertApproxEqAbs(
            IERC20(address(ETHX)).balanceOf(address(board)), ethxBoardBefore, 1e9, "ETHx not re-wrapped"
        );
        _notJailed();
    }

    /// @notice A leaderboard with no beneficiary credits backers the full inflow (nothing is stranded),
    ///         and settle pays it out without going insolvent.
    function test_zeroBeneficiary_creditsBackersFully() public {
        vm.prank(admin);
        factory.setRevNetEnabled(false);
        (address b2,) = factory.createLeaderboard(address(0), "No Beneficiary");
        StreamingLeaderboard nb = StreamingLeaderboard(payable(b2));

        address creator = makeAddr("nbCreator");
        vm.prank(creator);
        address m = nb.createMarkee("m", "alpha");

        address backer = makeAddr("nbBacker");
        _fundApprove(backer, address(nb));
        int96 r = _rate(0.05 ether);
        _openOn(nb, backer, m, r);
        assertEq(nb.topMarkee(), m);

        vm.warp(block.timestamp + 30 days);
        uint256 pending = nb.pendingSettlement(backer);
        uint256 expectedFull = uint256(uint96(r)) * 30 days;
        assertApproxEqRel(pending, expectedFull, 5e16, "no-beneficiary backer not credited the full inflow");

        uint256 balBefore = backer.balance;
        address[] memory arr = new address[](1);
        arr[0] = backer;
        nb.settle(arr);
        assertApproxEqAbs(backer.balance - balBefore, pending, 1e12, "backer not paid ~full");
        assertFalse(_critical(address(nb)), "no-beneficiary board went insolvent on settle");
    }

    /// @notice The Markee owner can reassign free-edit ownership through the board; non-owners cannot.
    function test_transferMarkeeOwnership() public {
        address m = _newMarkee("m", "alpha");
        address owner0 = IMarkee(m).owner();
        address newOwner = makeAddr("newOwner");

        vm.prank(owner0);
        board.transferMarkeeOwnership(m, newOwner);
        assertEq(IMarkee(m).owner(), newOwner, "ownership not transferred");

        vm.expectRevert(bytes("Only Markee owner"));
        board.transferMarkeeOwnership(m, makeAddr("x"));
    }

    /// @notice Pagination past the end returns an empty array instead of reverting on underflow.
    function test_pagination_offsetPastEnd_returnsEmpty() public {
        address[] memory empty = board.getMarkees(board.markeeCount() + 5, 10);
        assertEq(empty.length, 0, "getMarkees past end should be empty");
        address[] memory empty2 = factory.getLeaderboards(100, 10);
        assertEq(empty2.length, 0, "getLeaderboards past end should be empty");
    }

    // ─── getTopMarkees (effective-rate ranking view) ────────────────────────────

    /// @notice getTopMarkees orders Markees by descending effective rate (not registration order),
    ///         returns each one's effectiveRate as the second array, slots #1 == the enforced topMarkee,
    ///         and clamps a limit above the registry size to the full count.
    function test_getTopMarkees_ranksByEffectiveRate() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");
        address c = _newMarkee("c", "charlie");
        _open(_backer("backerA"), a, _rate(0.02 ether));
        _open(_backer("backerB"), b, _rate(0.01 ether));
        _open(_backer("backerC"), c, _rate(0.03 ether)); // highest → auto-flips to #1
        assertEq(board.topMarkee(), c, "C should be the enforced top");

        (address[] memory top, uint256[] memory rates) = board.getTopMarkees(3);
        assertEq(top[0], c, "slot 0 should be the highest rate (C)");
        assertEq(top[1], a, "slot 1 should be the middle rate (A)");
        assertEq(top[2], b, "slot 2 should be the lowest backed rate (B)");
        assertGt(rates[0], rates[1], "rates not descending (0 vs 1)");
        assertGt(rates[1], rates[2], "rates not descending (1 vs 2)");
        assertEq(rates[0], board.effectiveRate(c), "rate[0] != C effectiveRate");
        assertEq(rates[1], board.effectiveRate(a), "rate[1] != A effectiveRate");
        assertEq(rates[2], board.effectiveRate(b), "rate[2] != B effectiveRate");

        (address[] memory one,) = board.getTopMarkees(1);
        assertEq(one.length, 1, "limit 1 should return a single entry");
        assertEq(one[0], board.topMarkee(), "getTopMarkees(1) #1 must equal the enforced topMarkee");

        (address[] memory all,) = board.getTopMarkees(1000);
        assertEq(all.length, board.markeeCount(), "an over-large limit must clamp to markeeCount");
        _notJailed();
    }

    /// @notice The view recomputes effective rates live, so after a decay/demotion it already ranks the
    ///         rightful winner #1 while the enforced `topMarkee` is still the stale incumbent. Once the
    ///         permissionless claimTop poke heals the lag, the view's #1 and the enforced #1 agree.
    function test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals() public {
        address a = _newMarkee("a", "alpha");
        address b = _newMarkee("b", "bravo");
        address backerA = _backer("backerA");
        _open(backerA, a, _rate(0.03 ether)); // A top
        _open(_backer("backerB"), b, _rate(0.02 ether)); // B below A
        assertEq(board.topMarkee(), a);

        // A drops below B; the decay direction fires no promotion, so the enforced top stays stale.
        vm.prank(backerA);
        CFA.updateFlow(ETHX, backerA, address(board), _rate(0.005 ether), abi.encode(a));
        assertEq(board.topMarkee(), a, "enforced top should still be the stale A");

        (address[] memory top, uint256[] memory rates) = board.getTopMarkees(2);
        assertEq(top[0], b, "live ranking should already put B first before the poke");
        assertEq(top[1], a, "A should rank second after dropping below B");
        assertGt(rates[0], rates[1], "rates not descending");
        assertEq(rates[0], board.effectiveRate(b), "rate[0] != B effectiveRate");

        board.claimTop(b);
        assertEq(board.topMarkee(), b, "claimTop did not flip");
        (address[] memory healed,) = board.getTopMarkees(1);
        assertEq(healed[0], board.topMarkee(), "view #1 must equal enforced #1 after claimTop");
        _notJailed();
    }

    /// @notice A migrated lump-sum Markee with no stream is ranked by its grandfather floor, and the
    ///         second array reports that floor (its effectiveRate), matching the on-chain seeded #1.
    function test_getTopMarkees_ranksMigratedMarkeeByLegacyFloor() public {
        address L = _migrateInPaidMarkee(0.03 ether, "L"); // holds #1 by its floor, zero inflow

        (address[] memory top, uint256[] memory rates) = board.getTopMarkees(1);
        assertEq(top[0], L, "migrated lump-sum Markee should top the view by its floor");
        assertEq(top[0], board.topMarkee(), "view #1 must equal the seeded on-chain #1");
        assertEq(rates[0], board.currentLegacyFloor(L), "view rate for a floor-held spot must equal its floor");
        assertGt(rates[0], 0, "floor-held #1 must have a positive effective rate");
        _notJailed();
    }

    // ─── v1.3 ABI-compat reads (minimumPrice / totalLeaderboardFunds) ────────────

    /// @notice minimumPrice() is the streaming board's monthly participation floor: it aliases
    ///         minimumMonthlyRate and tracks it across an admin update.
    function test_minimumPrice_aliasesMonthlyRate() public {
        assertEq(board.minimumPrice(), board.minimumMonthlyRate(), "minimumPrice must alias minimumMonthlyRate");
        uint256 newRate = 0.01 ether;
        board.setMinimumMonthlyRate(newRate); // board admin == this test contract
        assertEq(board.minimumPrice(), newRate, "minimumPrice must track minimumMonthlyRate after update");
    }

    /// @notice totalLeaderboardFunds() sums each Markee's carried-over lump-sum total: migrated Markees
    ///         keep their historical funds, natively-created streaming Markees contribute zero.
    function test_totalLeaderboardFunds_sumsCarriedOverTotals() public {
        address a = _migrateInPaidMarkee(0.03 ether, "a");
        address b = _migrateInPaidMarkee(0.05 ether, "b");
        address native = _newMarkee("n", "native"); // streaming-only, never took a lump-sum payment

        assertGt(IMarkee(a).totalFundsAdded(), 0, "migrated Markee should carry its lump-sum total");
        assertEq(IMarkee(native).totalFundsAdded(), 0, "native streaming Markee should carry zero funds");

        uint256 expected =
            IMarkee(a).totalFundsAdded() + IMarkee(b).totalFundsAdded() + IMarkee(native).totalFundsAdded();
        assertEq(board.totalLeaderboardFunds(), expected, "totalLeaderboardFunds != sum of carried-over totals");
        _notJailed();
    }
}

/// @dev Repoints a Markee back to a board it was migrated away from (only the current strategy may).
contract StubStrategy {
    function repoint(address markee, address newStrategy) external {
        IMarkee(markee).setPricingStrategy(newStrategy);
    }
}

/// @dev A backer contract that rejects ETH on receive, to exercise settle's per-backer isolation.
contract BadBacker {
    function setup(
        ICFAForwarder cfa,
        IGDAForwarder gda,
        ISuperToken ethx,
        StreamingLeaderboard board,
        address markee,
        int96 rate,
        uint256 deposit
    ) external payable {
        ISETH(address(ethx)).upgradeByETH{value: msg.value}();
        IERC20(address(ethx)).approve(address(board), type(uint256).max);
        board.depositBuffer(address(this), deposit);
        gda.connectPool(board.poolOf(markee), "");
        cfa.createFlow(ethx, address(this), address(board), rate, abi.encode(markee));
    }

    receive() external payable {
        revert("BadBacker rejects ETH");
    }
}
