// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { ISuperApp } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperApp.sol";
import { ISuperfluidPool } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/gdav1/ISuperfluidPool.sol";
import { ISETH } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/tokens/ISETH.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { StreamingLeaderboardFactory } from "../../contracts/streaming/StreamingLeaderboardFactory.sol";
import { StreamingLeaderboard } from "../../contracts/v1.3/streaming/StreamingLeaderboard.sol";
import { Markee } from "../../contracts/v1.3/Markee.sol";
import { MarkeeJuiceboxForwarder } from "../../contracts/integrations/juicebox/MarkeeJuiceboxForwarder.sol";

interface ICFAForwarderT {
    function createFlow(ISuperToken token, address sender, address receiver, int96 flowrate, bytes memory userData)
        external
        returns (bool);
    function updateFlow(ISuperToken token, address sender, address receiver, int96 flowrate, bytes memory userData)
        external
        returns (bool);
    function deleteFlow(ISuperToken token, address sender, address receiver, bytes memory userData)
        external
        returns (bool);
    function getFlowrate(ISuperToken token, address sender, address receiver) external view returns (int96);
}

interface IGDAForwarderT {
    function connectPool(ISuperfluidPool pool, bytes memory userData) external returns (bool);
}

interface IGovT {
    function setAppRegistrationKey(ISuperfluid host, address deployer, string memory key, uint256 expirationTs)
        external;
}

interface IOwnableT {
    function owner() external view returns (address);
}

interface IJBTokensT {
    function totalBalanceOf(address holder, uint256 projectId) external view returns (uint256);
}

interface IJBTerminalStoreT {
    function balanceOf(address terminal, uint256 projectId, address token) external view returns (uint256);
}

interface IFactoryAdminT {
    function setRevNetEnabled(bool enabled) external;
    function setPlatformFeeReceiver(address receiver) external;
    function setPercentToBeneficiary(uint256 percent) external;
    function percentToPlatformFeeReceiver() external view returns (uint256);
}

/// @dev A backer that is a contract and burns all its gas whenever it receives ETH, e.g. when the
///      leaderboard settles it directly (RevNet disabled).
contract GasBurningBacker {
    receive() external payable {
        while (true) {}
    }

    function open(address board, address ethx, address cfa, address gda, address pool, address markee, int96 rate)
        external
        payable
    {
        (bool ok,) = ethx.call{ value: msg.value }(abi.encodeWithSignature("upgradeByETH()"));
        require(ok, "wrap");
        IERC20(ethx).approve(board, type(uint256).max);
        StreamingLeaderboard(payable(board)).depositBuffer(address(this), uint256(uint96(rate)) * 14400);
        IGDAForwarderT(gda).connectPool(ISuperfluidPool(pool), "");
        ICFAForwarderT(cfa).createFlow(ISuperToken(ethx), address(this), board, rate, abi.encode(markee));
    }
}

interface IJBDirectoryT {
    function primaryTerminalOf(uint256 projectId, address token) external view returns (address);
}

/// @dev Mimics how a For Sale Markee pays its beneficiary: a plain ETH call that must succeed.
contract ForSaleLikePayer {
    function payBeneficiary(address beneficiary) external payable {
        (bool ok,) = beneficiary.call{ value: msg.value }("");
        require(ok, "Transfer to beneficiary failed");
    }
}

/// @notice Base-mainnet fork tests: real StreamingLeaderboard + Superfluid ETHx + Juicebox v6.
/// Run: BASE_RPC_URL=<base-rpc> forge test --match-contract MarkeeJuiceboxForwarderTest -vvv
contract MarkeeJuiceboxForwarderTest is Test {
    // ─── Base (8453) ────────────────────────────────────────────────────────────
    address constant HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    ISuperToken constant ETHX = ISuperToken(0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93);
    ICFAForwarderT constant CFA = ICFAForwarderT(0xcfA132E353cB4E398080B9700609bb008eceB125);
    IGDAForwarderT constant GDA = IGDAForwarderT(0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08);
    address constant JB_DIRECTORY = 0x5AfF29060E023e6FB87BE5596652B33c65Af535B;
    IJBTokensT constant JB_TOKENS = IJBTokensT(0x1f80d8f057eE36b4C2656D107E4e4558B71bA7D9);
    address constant JB_TERMINAL = 0x130f5Dd2bD8805443Cf41755253D778a75a67f53;
    IJBTerminalStoreT constant JB_STORE = IJBTerminalStoreT(0x7497ae014A60561925B51C0A3B4adE7460B9927C);
    uint256 constant MARKEE_REVNET_PROJECT = 7;
    /// The Juicebox project the forwarder pays (stands in for Jango's project). Accepts ETH at the fork block.
    uint256 constant JB_PROJECT = 1;

    uint256 constant DEFAULT_FORK_BLOCK = 48400000;
    uint256 constant SECONDS_IN_MONTH = 2628000;
    uint256 constant BUFFER_PERIOD = 14400;
    uint256 constant BPS = 10000;
    bytes4 constant PAY_SELECTOR = bytes4(keccak256("pay(uint256,address,uint256,address,uint256,string,bytes)"));

    StreamingLeaderboardFactory factory;
    StreamingLeaderboard board;
    MarkeeJuiceboxForwarder fwd;
    address admin = makeAddr("coopAdmin");
    address initialBeneficiary = makeAddr("initialBeneficiary");

    event Credited(address indexed backer, uint256 settledRent, uint256 credit);
    event Paid(address indexed backer, uint256 amount, uint256 beneficiaryTokenCount);

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_RPC_URL"), vm.envOr("FORK_BLOCK", DEFAULT_FORK_BLOCK));
        assertEq(IJBDirectoryT(JB_DIRECTORY).primaryTerminalOf(JB_PROJECT, address(0xEEEe)), JB_TERMINAL);

        address boardImpl = address(new StreamingLeaderboard(ISuperfluid(HOST), ETHX));
        address markeeImpl = address(new Markee());
        factory = new StreamingLeaderboardFactory(
            ISuperfluid(HOST), ETHX, boardImpl, markeeImpl, JB_TERMINAL, MARKEE_REVNET_PROJECT, address(0), admin
        );
        ISuperfluid host = ISuperfluid(HOST);
        address gov = address(host.getGovernance());
        vm.prank(IOwnableT(gov).owner());
        IGovT(gov).setAppRegistrationKey(host, address(factory), "k1", type(uint256).max);

        // The sign owner (this test contract) creates a For Rent sign, deploys the forwarder for it, and
        // points the sign's beneficiary at the forwarder before anyone streams.
        (address b,) = factory.createLeaderboard(initialBeneficiary, "Jango Board", "Open Internet", "openinternet");
        board = StreamingLeaderboard(payable(b));
        fwd = new MarkeeJuiceboxForwarder(JB_DIRECTORY, address(board), JB_PROJECT, "Markee For Rent");
        board.setBeneficiaryAddress(address(fwd));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /// @dev via_ir can cache block.timestamp across vm.warp calls; read the cheatcode clock instead.
    function _warp(uint256 dt) internal {
        vm.warp(vm.getBlockTimestamp() + dt);
    }

    function _rate(uint256 monthlyWei) internal pure returns (int96) {
        return int96(int256(monthlyWei / SECONDS_IN_MONTH));
    }

    function _backer(string memory name) internal returns (address who) {
        who = makeAddr(name);
        vm.deal(who, 100 ether);
        vm.startPrank(who);
        ISETH(address(ETHX)).upgradeByETH{ value: 50 ether }();
        IERC20(address(ETHX)).approve(address(board), type(uint256).max);
        vm.stopPrank();
    }

    function _open(address who, address markee, int96 rate) internal {
        vm.startPrank(who);
        board.depositBuffer(who, uint256(uint96(rate)) * BUFFER_PERIOD);
        GDA.connectPool(board.poolOf(markee), "");
        CFA.createFlow(ETHX, who, address(board), rate, abi.encode(markee));
        vm.stopPrank();
    }

    function _newMarkee(string memory name_) internal returns (address m) {
        vm.prank(makeAddr(string.concat("creator-", name_)));
        m = board.createMarkee("msg", name_);
    }

    function _one(address a) internal pure returns (address[] memory arr) {
        arr = new address[](1);
        arr[0] = a;
    }

    function _none() internal pure returns (address[] memory) {
        return new address[](0);
    }

    function _two(address a, address b) internal pure returns (address[] memory arr) {
        arr = new address[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _jb(address holder) internal view returns (uint256) {
        return JB_TOKENS.totalBalanceOf(holder, JB_PROJECT);
    }

    function _markeeTokens(address holder) internal view returns (uint256) {
        return JB_TOKENS.totalBalanceOf(holder, MARKEE_REVNET_PROJECT);
    }

    function _held() internal view returns (uint256) {
        return address(fwd).balance + IERC20(address(ETHX)).balanceOf(address(fwd));
    }

    function _notJailed() internal view {
        assertFalse(ISuperfluid(HOST).isAppJailed(ISuperApp(address(board))), "board jailed");
    }

    // ─── Deployment ─────────────────────────────────────────────────────────────

    function test_constructor_wiring() public view {
        assertEq(address(fwd.DIRECTORY()), JB_DIRECTORY);
        assertEq(address(fwd.LEADERBOARD()), address(board));
        assertEq(address(fwd.ETHX()), address(ETHX));
        assertEq(fwd.PROJECT_ID(), JB_PROJECT);
        assertEq(fwd.memo(), "Markee For Rent");
        assertEq(board.beneficiaryAddress(), address(fwd));
        assertEq(fwd.VERSION(), "0.3.0-beta");
        assertEq(fwd.ratioNum(), 6200);
        assertEq(fwd.ratioDen(), 3800);
    }

    function test_constructor_rejectsBadConfig() public {
        vm.expectRevert(MarkeeJuiceboxForwarder.ZeroAddress.selector);
        new MarkeeJuiceboxForwarder(address(0), address(board), JB_PROJECT, "");
        vm.expectRevert(MarkeeJuiceboxForwarder.ZeroAddress.selector);
        new MarkeeJuiceboxForwarder(JB_DIRECTORY, address(0), JB_PROJECT, "");
        vm.expectRevert(MarkeeJuiceboxForwarder.ZeroProjectId.selector);
        new MarkeeJuiceboxForwarder(JB_DIRECTORY, address(board), 0, "");
    }

    // ─── Core flow ──────────────────────────────────────────────────────────────

    function test_beneficiaryStreamFlowsToForwarder() public {
        int96 r = _rate(0.02 ether);
        _open(_backer("alice"), _newMarkee("alpha"), r);
        int96 expected = int96(int256(uint256(uint96(r)) * board.percentToBeneficiary() / BPS));
        assertEq(CFA.getFlowrate(ETHX, address(board), address(fwd)), expected, "beneficiary stream != 62%");
        _notJailed();
    }

    function test_sync_paysProject_tokensToBacker_andMarkeeToo() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);

        uint256 pending = board.pendingSettlement(alice);
        uint256 share = fwd.shareOf(pending);
        assertApproxEqRel(share, pending * 6200 / 3800, 1e12, "live ratio should match the 62% setting");
        uint256 expectedCredit = share < _held() ? share : _held(); // capped by funds received
        assertApproxEqRel(expectedCredit, share, 1e12, "cap should only trim rounding dust");
        assertGt(pending, 0, "nothing accrued");
        assertEq(fwd.pendingCredit(alice), expectedCredit, "view mismatch");
        assertEq(_jb(alice), 0);
        assertEq(_markeeTokens(alice), 0);

        uint256 heldBefore = _held();
        vm.expectEmit(true, false, false, true, address(fwd));
        emit Credited(alice, pending, expectedCredit);
        vm.prank(makeAddr("anyKeeper")); // permissionless
        fwd.sync(_one(alice));

        assertGt(_jb(alice), 0, "no project tokens issued to backer");
        assertGt(_markeeTokens(alice), 0, "backer did not also receive MARKEE");
        assertEq(board.pendingSettlement(alice), 0, "leaderboard not settled");
        assertEq(fwd.owedOf(alice), 0, "credit not fully paid");
        assertEq(fwd.totalOwed(), 0);
        assertEq(heldBefore - _held(), expectedCredit, "forwarder did not spend exactly the credit");
        assertEq(_jb(makeAddr("anyKeeper")), 0, "caller must not receive tokens");
        _notJailed();
    }

    function test_credit_matchesStreamReceived() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.05 ether));
        _warp(10 days);

        uint256 received = _held();
        uint256 credit = fwd.pendingCredit(alice);
        assertLe(credit, received, "credit exceeds ETHx actually received");
        assertApproxEqRel(credit, received, 1e14, "credit should track the stream within 0.01%");
    }

    function test_sync_proRataAcrossBackers() public {
        address m = _newMarkee("alpha");
        address alice = _backer("alice");
        address bob = _backer("bob");
        _open(alice, m, _rate(0.01 ether));
        _open(bob, m, _rate(0.03 ether));
        _warp(20 days);

        uint256 creditA = fwd.pendingCredit(alice);
        uint256 creditB = fwd.pendingCredit(bob);
        assertApproxEqRel(creditB, creditA * 3, 1e15, "credit not pro-rata by flow rate");
        assertApproxEqRel(creditA + creditB, _held(), 1e12, "credits should consume the stream received");

        fwd.sync(_two(alice, bob));
        assertApproxEqRel(_jb(bob), _jb(alice) * 3, 1e15, "tokens not pro-rata");
        assertEq(fwd.totalOwed(), 0);
    }

    function test_onlyTopMarkeeBackersEarn() public {
        address a = _newMarkee("alpha");
        address b = _newMarkee("bravo");
        address top = _backer("top");
        address loser = _backer("loser");
        _open(top, a, _rate(0.03 ether));
        _open(loser, b, _rate(0.01 ether));
        _warp(15 days);

        fwd.sync(_two(top, loser));
        assertGt(_jb(top), 0, "top backer earned nothing");
        assertEq(_jb(loser), 0, "refunded loser must not earn project tokens");
    }

    function test_repeatedSyncs_creditEachSliceOnce() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));

        uint256 total;
        for (uint256 i = 0; i < 3; i++) {
            _warp(7 days);
            total += fwd.pendingCredit(alice);
            fwd.sync(_one(alice));
        }
        assertEq(fwd.pendingCredit(alice), 0);
        fwd.sync(_one(alice)); // same block: nothing new
        assertEq(fwd.totalOwed(), 0);
    }

    function test_duplicateBackers_noDoubleCredit() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);
        uint256 expected = fwd.pendingCredit(alice);
        uint256 heldBefore = _held();

        address[] memory dup = new address[](3);
        dup[0] = alice;
        dup[1] = alice;
        dup[2] = alice;
        fwd.sync(dup);
        assertEq(heldBefore - _held(), expected, "duplicate entries were double-credited");
    }

    function test_unknownAndZeroBackers_areNoops() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(5 days);
        uint256 heldBefore = _held();
        fwd.sync(_two(address(0), makeAddr("stranger")));
        assertEq(_held(), heldBefore, "funds moved for non-backers");
        assertEq(_jb(makeAddr("stranger")), 0);
    }

    function test_backerWhoClosedStream_stillSyncsRealizedRent() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(10 days);
        vm.prank(alice);
        CFA.deleteFlow(ETHX, alice, address(board), "");
        uint256 credit = fwd.pendingCredit(alice);
        assertGt(credit, 0, "realized rent lost on close");

        _warp(10 days); // no accrual after close
        assertEq(fwd.pendingCredit(alice), credit);
        fwd.sync(_one(alice));
        assertGt(_jb(alice), 0);
        _notJailed();
    }

    // ─── Known limitation: Claim button before sync (under-credit, never over-credit) ──

    function test_claimButtonFirst_underCreditsButNeverOverCredits() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(10 days);

        vm.prank(alice);
        board.settle(_one(alice)); // Markee's own Claim button
        uint256 stranded = _held();
        assertGt(stranded, 0);

        fwd.sync(_one(alice));
        assertEq(_jb(alice), 0, "slice settled elsewhere must not be credited");
        assertEq(_held(), stranded, "stranded share should remain unattributed");

        // Accrual after the external settle is still credited normally.
        _warp(10 days);
        fwd.sync(_one(alice));
        assertGt(_jb(alice), 0);
    }

    // ─── Failure handling ───────────────────────────────────────────────────────

    function test_terminalFailure_keepsCreditOwed_thenPayOwed() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);
        uint256 credit = fwd.pendingCredit(alice);

        vm.mockCallRevert(JB_TERMINAL, abi.encodeWithSignature(
            "pay(uint256,address,uint256,address,uint256,string,bytes)",
            JB_PROJECT, address(0xEEEe), credit, alice, 0, "Markee For Rent", ""
        ), "paused");
        fwd.sync(_one(alice));
        assertEq(fwd.owedOf(alice), credit, "credit lost on failed pay");
        assertEq(fwd.totalOwed(), credit);
        assertEq(_jb(alice), 0);
        assertGt(_markeeTokens(alice), 0, "MARKEE settle should not depend on project payment");
        vm.clearMockedCalls();

        vm.prank(makeAddr("anyKeeper"));
        fwd.payOwed(_one(alice));
        assertEq(fwd.owedOf(alice), 0);
        assertGt(_jb(alice), 0, "retry did not issue tokens");
    }

    function test_noTerminal_keepsCreditOwed() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);
        vm.mockCall(
            JB_DIRECTORY,
            abi.encodeWithSignature("primaryTerminalOf(uint256,address)", JB_PROJECT, address(0xEEEe)),
            abi.encode(address(0))
        );
        fwd.sync(_one(alice));
        assertGt(fwd.owedOf(alice), 0);
        vm.clearMockedCalls();
        fwd.payOwed(_one(alice));
        assertEq(fwd.owedOf(alice), 0);
    }

    // ─── Beneficiary binding ────────────────────────────────────────────────────

    function test_rejectsPlainEth_soForSaleMisuseReverts() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(fwd).call{ value: 1 wei }("");
        assertFalse(ok, "plain ETH accepted");

        ForSaleLikePayer forSaleMarkee = new ForSaleLikePayer();
        vm.expectRevert("Transfer to beneficiary failed");
        forSaleMarkee.payBeneficiary{ value: 0.01 ether }(address(fwd));
    }

    function test_sync_revertsWhenNotBeneficiary() public {
        board.setBeneficiaryAddress(initialBeneficiary);
        vm.expectRevert(MarkeeJuiceboxForwarder.NotBeneficiary.selector);
        fwd.sync(_one(makeAddr("alice")));
    }

    function test_detach_payOwedStillWorks_andSweepSurplusToProject() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(10 days);
        vm.prank(alice);
        board.settle(_one(alice)); // creates an unattributable slice
        _warp(10 days);

        vm.mockCallRevert(JB_TERMINAL, abi.encodeWithSelector(PAY_SELECTOR, JB_PROJECT), "x"); // project pays only
        fwd.sync(_one(alice));
        vm.clearMockedCalls();
        uint256 owed = fwd.owedOf(alice);
        assertGt(owed, 0);

        // While attached, a sweep never touches owed credits.
        fwd.sweepSurplus(_none());
        assertGe(_held(), owed, "attached sweep took owed credits");
        assertEq(fwd.owedOf(alice), owed);

        board.setBeneficiaryAddress(initialBeneficiary);
        assertEq(CFA.getFlowrate(ETHX, address(board), address(fwd)), 0, "stream should move off forwarder");

        assertEq(fwd.sweepable(), fwd.unallocated(), "detached: no reserve");
        fwd.sweepSurplus(_none()); // detached: everything unallocated goes
        assertEq(_held(), owed, "sweep must leave exactly the owed credits");
        fwd.payOwed(_one(alice));
        assertEq(_held(), 0);
        assertGt(_jb(alice), 0);
        _notJailed();
    }

    function test_attachToExistingSign_settleAllInSameTx() public {
        // A sign that already has a backer accruing toward its old beneficiary.
        board.setBeneficiaryAddress(initialBeneficiary);
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);
        assertGt(board.pendingSettlement(alice), 0);

        // Recommended attach procedure (one batched admin tx): settle everyone, then switch.
        board.settle(_one(alice));
        board.setBeneficiaryAddress(address(fwd));
        assertEq(fwd.pendingCredit(alice), 0, "pre-attach rent must not be credited");

        _warp(10 days);
        uint256 credit = fwd.pendingCredit(alice);
        assertLe(credit, _held(), "post-attach credit exceeds received");
        fwd.sync(_one(alice));
        assertGt(_jb(alice), 0);
    }

    function test_markeeSettleFails_noCredit() public {
        // If the leaderboard cannot pay a backer's MARKEE, it restores their balance; the forwarder must
        // then credit nothing (it only credits what the leaderboard actually settled).
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);
        uint256 pendingBefore = board.pendingSettlement(alice);

        vm.mockCallRevert(JB_TERMINAL, abi.encodeWithSelector(PAY_SELECTOR, MARKEE_REVNET_PROJECT), "revnet paused");
        fwd.sync(_one(alice));
        vm.clearMockedCalls();

        assertEq(board.pendingSettlement(alice), pendingBefore, "leaderboard should have restored the balance");
        assertEq(fwd.owedOf(alice), 0, "credited rent that was never settled");
        assertEq(_jb(alice), 0);

        fwd.sync(_one(alice)); // once MARKEE settles, the full slice is credited
        assertGt(_jb(alice), 0);
        assertGt(_markeeTokens(alice), 0);
    }

    /// @dev Regression: with a tight gas limit (as gas estimation picks), the try/catch'd payouts could
    ///      run out of gas while the outer sync still succeeded. Every gas limit must now either revert
    ///      or fully settle and pay; none may "succeed" leaving the credit unpaid or the rent unsettled.
    function test_lowGas_neverSucceedsWithoutPaying() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(30 days);

        uint256 successes;
        for (uint256 g = 500_000; g <= 9_000_000; g += 500_000) {
            uint256 snap = vm.snapshotState();
            (bool ok,) = address(fwd).call{ gas: g }(abi.encodeCall(fwd.sync, (_one(alice))));
            if (ok) {
                successes++;
                assertEq(board.pendingSettlement(alice), 0, "sync succeeded without settling MARKEE");
                assertEq(fwd.owedOf(alice), 0, "sync succeeded without paying the project");
                assertGt(_jb(alice), 0, "sync succeeded without issuing project tokens");
            }
            vm.revertToState(snap);
        }
        assertGt(successes, 0, "no gas limit in range was enough");
    }

    // ─── Weekly sweep while attached ────────────────────────────────────────────

    function _projectBalance() internal view returns (uint256) {
        return JB_STORE.balanceOf(JB_TERMINAL, JB_PROJECT, address(0xEEEe));
    }

    function test_sweep_movesStrandedFunds_keepsReserve_andKeepsSyncing() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(5 days);
        vm.prank(alice);
        board.settle(_one(alice)); // Claim button: this slice can no longer be attributed
        uint256 stranded = fwd.unallocated();
        assertGt(stranded, 0);

        // Right after the Claim nothing is unsynced, so all but the reserve (which covers the board's
        // holdings, here mostly alice's buffer deposit) is sweepable.
        uint256 reserve = fwd.reserve();
        assertGt(reserve, 0);
        assertLt(reserve, stranded, "reserve should be small next to 5 days of rent");
        assertEq(fwd.sweepable(), stranded - reserve);

        uint256 projectBefore = _projectBalance();
        uint256 swept = fwd.sweepSurplus(_one(alice));
        assertEq(swept, stranded - reserve);
        assertEq(_projectBalance() - projectBefore, swept, "project balance did not receive the sweep");
        assertEq(fwd.totalOwed(), 0);

        // Daily syncs still credit the full share: nothing they needed was swept.
        uint256 tokens = _jb(alice);
        for (uint256 d = 0; d < 3; d++) {
            _warp(1 days);
            uint256 expected = fwd.shareOf(board.pendingSettlement(alice));
            uint256 heldBefore = _held();
            fwd.sync(_one(alice));
            assertApproxEqAbs(heldBefore - _held(), expected, 1e9, "sync after a sweep was short-changed");
            assertGt(_jb(alice), tokens);
            tokens = _jb(alice);
        }
        // The rest stays held back as the standing reserve until there is less on the board to cover.
        assertLe(fwd.sweepSurplus(_one(alice)), reserve);
    }

    function test_sweep_withNoStrandedFunds_sweepsNothing_andSyncsListedBackers() public {
        // Rent accrued but not yet synced is not stranded: it is inside the reserve.
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(8 days);

        assertGt(fwd.pendingCredit(alice), 0);
        assertEq(fwd.sweepable(), 0, "unsynced rent counted as sweepable");
        assertEq(fwd.sweepSurplus(_none()), 0, "unsynced rent was swept");
        assertEq(fwd.sweepSurplus(_one(alice)), 0);
        assertGt(_jb(alice), 0, "listed backer should have been synced and paid");
    }

    function test_sweep_isPermissionlessAndCallableAnyTime() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(5 days);
        vm.prank(alice);
        board.settle(_one(alice));
        vm.prank(makeAddr("anyone"));
        assertGt(fwd.sweepSurplus(_none()), 0);
        vm.prank(makeAddr("anyoneElse"));
        assertEq(fwd.sweepSurplus(_none()), 0, "a second sweep in the same block found more");
    }

    // ─── Fee receiver and misbehaving backers ───────────────────────────────────

    function test_platformFeeReceiver_isNeverCredited() public {
        address feeBacker = _backer("feeReceiver");
        vm.prank(admin);
        IFactoryAdminT(address(factory)).setPlatformFeeReceiver(feeBacker);
        _open(feeBacker, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(10 days);
        assertGt(board.pendingSettlement(feeBacker), 0);
        assertEq(fwd.pendingCredit(feeBacker), 0, "view should not promise the fee receiver a credit");

        fwd.sync(_one(feeBacker));
        assertEq(fwd.owedOf(feeBacker), 0);
        assertEq(_jb(feeBacker), 0, "fee receiver must not get project tokens");
        assertGt(board.pendingSettlement(feeBacker), 0, "the forwarder should not settle the fee receiver");
    }

    function test_gasBurningBacker_isSkipped_othersStillSync() public {
        vm.prank(admin);
        IFactoryAdminT(address(factory)).setRevNetEnabled(false); // settle pays backers ETH directly

        address m = _newMarkee("alpha");
        address alice = _backer("alice");
        _open(alice, m, _rate(0.02 ether));
        GasBurningBacker burner = new GasBurningBacker();
        int96 r = _rate(0.02 ether);
        burner.open{ value: 1 ether }(
            address(board), address(ETHX), address(CFA), address(GDA), address(board.poolOf(m)), m, r
        );
        _warp(10 days);
        uint256 burnerPending = board.pendingSettlement(address(burner));
        assertGt(burnerPending, 0);

        address[] memory batch = _two(address(burner), alice);
        vm.recordLogs();
        fwd.sync{ gas: 15_000_000 }(batch);

        assertGt(_jb(alice), 0, "honest backer blocked by a gas-burning one");
        assertEq(fwd.owedOf(address(burner)), 0);
        assertEq(board.pendingSettlement(address(burner)), burnerPending, "burner's settle should be rolled back");
        bytes32 skippedTopic = keccak256("BackerSkipped(address,bytes)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool skipped;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(fwd) && logs[i].topics[0] == skippedTopic) skipped = true;
        }
        assertTrue(skipped, "BackerSkipped not emitted");
    }

    function test_syncWithTooLittleGas_revertsInsteadOfSkipping() public {
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(5 days);
        (bool ok, bytes memory ret) = address(fwd).call{ gas: 3_000_000 }(abi.encodeCall(fwd.sync, (_one(alice))));
        assertFalse(ok, "sync must not run a backer with less than BACKER_GAS");
        assertEq(bytes4(ret), MarkeeJuiceboxForwarder.InsufficientGas.selector);
        assertGt(board.pendingSettlement(alice), 0, "nothing should have been settled");
    }

    function test_processBacker_onlySelf() public {
        vm.expectRevert(MarkeeJuiceboxForwarder.OnlySelf.selector);
        fwd.processBacker(makeAddr("x"), 6200, 3800, 1 ether, true);
    }

    // ─── Review fixes: percentage changes, fee receiver rotation, incomplete sweep lists ──

    /// @dev A factory percentage change only reaches the streams at the board's next flow event, and the
    ///      leaderboard accrues backers from the live streams. Credits must follow the streams, so a
    ///      change cannot re-price rent that accrued at the old split.
    function test_percentChange_creditsAtTheRatioTheStreamsActuallyPaid() public {
        address m = _newMarkee("alpha");
        address alice = _backer("alice");
        _open(alice, m, _rate(0.02 ether));
        _warp(10 days);

        vm.prank(admin);
        IFactoryAdminT(address(factory)).setPercentToBeneficiary(5000);
        _warp(5 days); // no flow event yet: the board still streams and accrues at 62/38

        uint256 received = _held();
        assertApproxEqRel(fwd.pendingCredit(alice), received, 1e12, "credit re-priced at the new percentage");
        fwd.sync(_one(alice));
        assertApproxEqRel(received - _held(), received, 1e12, "alice short-changed");
        assertGt(_jb(alice), 0);
        assertApproxEqRel(fwd.ratioNum() * 3800, fwd.ratioDen() * 6200, 1e12, "ratio should still be 62:38");

        // A new backer's stream is a flow event: the beneficiary stream moves to 50%.
        address bob = _backer("bob");
        _open(bob, m, _rate(0.02 ether));
        _warp(10 days);
        uint256 heldBefore = _held();
        uint256 expected = fwd.pendingCredit(alice) + fwd.pendingCredit(bob);
        fwd.sync(_two(alice, bob));
        assertApproxEqRel(fwd.ratioNum(), fwd.ratioDen(), 1e12, "ratio should now be 50:50");
        assertApproxEqRel(heldBefore - _held(), expected, 1e12);
        assertApproxEqRel(expected, heldBefore, 1e9, "credits should consume what the new split streamed");
    }

    /// @dev Regression: a failed fee payment is put back on the fee receiver's leaderboard balance. After
    ///      the factory rotates the receiver, that balance must still never be credited as backer rent.
    function test_feeReceiverRotation_restoredFeeIsNeverCredited() public {
        address oldFee = makeAddr("oldFeeReceiver");
        vm.prank(admin);
        IFactoryAdminT(address(factory)).setPlatformFeeReceiver(oldFee);
        address alice = _backer("alice");
        _open(alice, _newMarkee("alpha"), _rate(0.02 ether));
        _warp(10 days);

        // Make only the aggregated fee pay fail (the MARKEE RevNet pay naming oldFee as recipient).
        uint256 amt = board.pendingSettlement(alice);
        uint256 fee = amt * IFactoryAdminT(address(factory)).percentToPlatformFeeReceiver() / BPS;
        assertGt(fee, 0);
        vm.mockCallRevert(
            JB_TERMINAL,
            abi.encodeWithSelector(PAY_SELECTOR, MARKEE_REVNET_PROJECT, address(0xEEEe), fee, oldFee),
            "fee pay failed"
        );
        fwd.sync(_one(alice));
        vm.clearMockedCalls();
        assertGt(_jb(alice), 0, "alice should have been credited in full");
        assertEq(board.claimable(oldFee), fee, "the failed fee should be back on the old receiver");
        assertTrue(fwd.isExcluded(oldFee));

        vm.prank(admin);
        IFactoryAdminT(address(factory)).setPlatformFeeReceiver(makeAddr("newFeeReceiver"));

        assertEq(fwd.pendingCredit(oldFee), 0, "view should not promise the old receiver a credit");
        uint256 unallocatedBefore = fwd.unallocated();
        fwd.sync(_one(oldFee));
        assertEq(fwd.owedOf(oldFee), 0, "restored fee credited as rent");
        assertEq(_jb(oldFee), 0);
        assertEq(fwd.unallocated(), unallocatedBefore);
        assertEq(board.pendingSettlement(oldFee), fee, "the forwarder should not settle the old receiver");
        assertTrue(fwd.isExcluded(makeAddr("newFeeReceiver")), "new receiver should be noted too");
    }

    /// @dev yolo-maxi's scenario: with no keeper at all, a griefer calls sweepSurplus with an incomplete
    ///      list, repeatedly and a week apart. The omitted backer's unsynced rent stays inside the reserve,
    ///      so it is never swept and they still get all their project tokens.
    function test_sweep_incompleteListsCannotSweepAnOmittedBackersRent_evenWithoutAKeeper() public {
        address m = _newMarkee("alpha");
        address alice = _backer("alice");
        address bob = _backer("bob");
        _open(alice, m, _rate(0.02 ether));
        _open(bob, m, _rate(0.06 ether));
        _warp(10 days);
        vm.prank(alice);
        board.settle(_one(alice)); // Claim button: alice's 10 days become stranded
        uint256 stranded = _held() - fwd.pendingCredit(bob);

        address griefer = makeAddr("griefer");
        uint256 totalSwept;
        for (uint256 w = 0; w < 3; w++) {
            vm.prank(griefer);
            totalSwept += fwd.sweepSurplus(_one(alice)); // bob is never listed, and nobody syncs him
            _warp(7 days);
        }
        vm.prank(griefer);
        totalSwept += fwd.sweepSurplus(_one(alice));

        // Bob, unsynced for 31 days, still gets his full share.
        uint256 expected = fwd.shareOf(board.pendingSettlement(bob));
        assertGt(expected, 0);
        uint256 heldBefore = _held();
        fwd.sync(_one(bob));
        assertApproxEqAbs(heldBefore - _held(), expected, 1e9, "bob was short-changed by the sweeps");
        assertEq(fwd.owedOf(bob), 0);
        assertGt(_jb(bob), 0);

        // The stranded slice reaches the project, minus the standing reserve (released on detach).
        fwd.sync(_two(alice, bob));
        totalSwept += fwd.sweepSurplus(_none());
        assertGt(totalSwept, 0);
        assertLe(totalSwept, stranded, "swept more than was stranded");
        assertApproxEqAbs(totalSwept + fwd.unallocated(), stranded, 1e9);
        assertLe(fwd.unallocated(), fwd.reserve(), "held back more than the reserve");
    }
}
