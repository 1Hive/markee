// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
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
        uint256 share = pending * 6200 / 3800;
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

        vm.expectRevert(MarkeeJuiceboxForwarder.StillBeneficiary.selector);
        fwd.sweepSurplus();

        board.setBeneficiaryAddress(initialBeneficiary);
        assertEq(CFA.getFlowrate(ETHX, address(board), address(fwd)), 0, "stream should move off forwarder");

        fwd.sweepSurplus();
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
}
