// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperApp.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { StreamingLeaderboardTest, IMarkee } from "./StreamingLeaderboard.t.sol";
import { StreamingLeaderboard } from "../contracts/v1.3/streaming/StreamingLeaderboard.sol";
import { Markee } from "../contracts/v1.3/Markee.sol";
import { LeaderboardFactory } from "../contracts/v1.3/LeaderboardFactory.sol";
import { Leaderboard } from "../contracts/v1.3/Leaderboard.sol";
import { BoardBeacon } from "../contracts/upgrade/BoardBeacon.sol";
import { StreamingBoardBeacon } from "../contracts/upgrade/StreamingBoardBeacon.sol";
import { BeaconForwarder, IBoardRouter } from "../contracts/upgrade/BeaconForwarder.sol";
import { BoardMigratorBase } from "../contracts/upgrade/BoardMigratorBase.sol";
import { StreamingBoardMigrator, IStreamingFactoryRegistry } from "../contracts/upgrade/StreamingBoardMigrator.sol";

contract ProbeImplementation {
    ISuperfluid public immutable HOST;
    ISuperToken private immutable TOKEN;

    constructor(ISuperfluid _host, ISuperToken _token) {
        HOST = _host;
        TOKEN = _token;
    }

    function isAcceptedSuperToken(ISuperToken superToken) external view returns (bool) {
        return superToken == TOKEN;
    }

    function probe() external view returns (address self, address storedAdmin) {
        self = address(this);
        assembly {
            storedAdmin := sload(1)
        }
    }
}

interface IProbe {
    function probe() external view returns (address self, address storedAdmin);
}

interface IBoardBeaconView {
    function boardBeacon() external view returns (address);
}

/// @notice Runs the full StreamingLeaderboard fork suite with every board created through a
///         BeaconForwarder, plus the beacon's own upgrade, pause and forced-migration behavior.
/// Run: BASE_RPC_URL=<base-rpc> forge test --match-contract StreamingLeaderboardViaBeaconTest
contract StreamingLeaderboardViaBeaconTest is StreamingLeaderboardTest {
    uint256 constant UPGRADE_DELAY = 2 days;

    StreamingBoardBeacon beacon;
    address plainImplementation;
    address coop = makeAddr("coop");
    address guardian = makeAddr("guardian");
    address operator = makeAddr("operator");

    function _boardImplementation() internal override returns (address) {
        plainImplementation = address(new StreamingLeaderboard(ISuperfluid(HOST), ETHX, address(this)));
        beacon = new StreamingBoardBeacon(
            ISuperfluid(HOST), ETHX, plainImplementation, coop, guardian, UPGRADE_DELAY, _pausableSelectors()
        );
        return address(new BeaconForwarder(IBoardRouter(address(beacon)), true));
    }

    function _pausableSelectors() internal pure returns (bytes4[] memory s) {
        s = new bytes4[](6);
        s[0] = StreamingLeaderboard.createMarkee.selector;
        s[1] = StreamingLeaderboard.depositBuffer.selector;
        s[2] = StreamingLeaderboard.claimTop.selector;
        s[3] = StreamingLeaderboard.settle.selector;
        s[4] = ISuperApp.afterAgreementCreated.selector;
        s[5] = ISuperApp.afterAgreementUpdated.selector;
    }

    function _paused(bytes4 selector) internal view returns (bytes memory) {
        return abi.encodeWithSelector(BoardBeacon.Paused.selector, address(board), selector);
    }

    // ─── Beacon wiring ────────────────────────────────────────────────────────

    function test_beacon_boardsRouteThroughBeacon() public view {
        assertEq(_implOf(address(board)), boardImplementation, "board is not a forwarder clone");
        assertEq(IBoardBeaconView(address(board)).boardBeacon(), address(beacon), "board does not expose beacon");
        assertEq(beacon.implementation(), plainImplementation);
        assertEq(board.factory(), address(factory), "factory not recorded through the forwarder");
    }

    function test_beacon_forwarderCannotBeInitializedDirectly() public {
        StreamingLeaderboard forwarder = StreamingLeaderboard(payable(boardImplementation));
        assertEq(address(forwarder.HOST()), HOST, "forwarder does not answer implementation views");
        vm.expectRevert(StreamingLeaderboard.AlreadyInitialized.selector);
        forwarder.initialize(admin, beneficiary, "x", address(1), 0, 1, 1, admin);
    }

    // ─── Upgrades ─────────────────────────────────────────────────────────────

    function test_beacon_upgradeRunsNewLogicOnEveryBoardInPlace() public {
        (address b2,) = factory.createLeaderboard(beneficiary, "Board Two", "GitHub", "github");
        ProbeImplementation probe = new ProbeImplementation(ISuperfluid(HOST), ETHX);

        vm.prank(coop);
        beacon.scheduleUpgrade(address(probe));
        vm.expectRevert(BoardBeacon.UpgradeNotReady.selector);
        beacon.executeUpgrade();
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeUpgrade();

        (address self1, address admin1) = IProbe(address(board)).probe();
        (address self2, address admin2) = IProbe(b2).probe();
        assertEq(self1, address(board), "board did not run new logic in its own context");
        assertEq(self2, b2, "second board not upgraded");
        assertEq(admin1, address(this), "board storage not preserved");
        assertEq(admin2, address(this), "second board storage not preserved");
    }

    function test_beacon_upgradePreservesLiveStreams() public {
        address m = _newMarkee("hello", "m");
        address who = _backer("upgrade-backer");
        int96 rate = _rate(0.05 ether);
        _open(who, m, rate);
        assertEq(board.topMarkee(), m);

        address v2 = address(new StreamingLeaderboard(ISuperfluid(HOST), ETHX, address(this)));
        vm.prank(coop);
        beacon.scheduleUpgrade(v2);
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeUpgrade();
        assertEq(beacon.implementation(), v2);

        assertEq(board.topMarkee(), m, "top lost across upgrade");
        assertEq(board.aggregateRate(m), uint256(uint96(rate)), "aggregate lost across upgrade");
        assertGt(_beneficiaryFlow(), 0, "beneficiary stream stopped");

        address who2 = _backer("upgrade-backer-2");
        address m2 = _newMarkee("second", "m2");
        _open(who2, m2, _rate(0.1 ether));
        assertEq(board.topMarkee(), m2, "post-upgrade inflow not ranked");

        vm.prank(who);
        CFA.deleteFlow(ETHX, who, address(board), "");
        vm.prank(who);
        board.withdrawDeposit();
        _notJailed();
    }

    function test_beacon_upgradeTimelockAndRoles() public {
        address v2 = address(new StreamingLeaderboard(ISuperfluid(HOST), ETHX, address(this)));

        vm.expectRevert(BoardBeacon.OnlyAdmin.selector);
        beacon.scheduleUpgrade(v2);
        vm.prank(guardian);
        vm.expectRevert(BoardBeacon.OnlyAdmin.selector);
        beacon.scheduleUpgrade(v2);

        vm.expectRevert(BoardBeacon.NoPendingUpgrade.selector);
        beacon.executeUpgrade();

        vm.prank(coop);
        beacon.scheduleUpgrade(v2);
        vm.warp(block.timestamp + UPGRADE_DELAY - 1);
        vm.expectRevert(BoardBeacon.UpgradeNotReady.selector);
        beacon.executeUpgrade();

        vm.expectRevert(BoardBeacon.OnlyAdminOrGuardian.selector);
        beacon.cancelUpgrade();
        vm.prank(guardian);
        beacon.cancelUpgrade();
        vm.warp(block.timestamp + 1);
        vm.expectRevert(BoardBeacon.NoPendingUpgrade.selector);
        beacon.executeUpgrade();
        assertEq(beacon.implementation(), plainImplementation);
    }

    function test_beacon_rejectsMiswiredImplementations() public {
        address codeless = address(uint160(uint256(keccak256("beacon-codeless-probe"))));
        assertEq(codeless.code.length, 0, "probe address unexpectedly has code");
        vm.startPrank(coop);
        vm.expectRevert(BoardBeacon.ImplementationNotContract.selector);
        beacon.scheduleUpgrade(codeless);
        address wrongHost = address(new ProbeImplementation(ISuperfluid(address(0xdead)), ETHX));
        vm.expectRevert(StreamingBoardBeacon.ImplementationHostMismatch.selector);
        beacon.scheduleUpgrade(wrongHost);
        address wrongToken = address(new ProbeImplementation(ISuperfluid(HOST), ISuperToken(address(0xbeef))));
        vm.expectRevert(StreamingBoardBeacon.ImplementationTokenMismatch.selector);
        beacon.scheduleUpgrade(wrongToken);
        vm.stopPrank();

        vm.expectRevert(BoardBeacon.DelayTooShort.selector);
        new StreamingBoardBeacon(ISuperfluid(HOST), ETHX, plainImplementation, coop, guardian, 1 days - 1, new bytes4[](0));
    }

    function test_beacon_rejectsForwarderOrSelfAsImplementation() public {
        vm.startPrank(coop);
        vm.expectRevert(BoardBeacon.ImplementationIsForwarder.selector);
        beacon.scheduleUpgrade(boardImplementation);
        vm.expectRevert(BoardBeacon.ImplementationIsForwarder.selector);
        beacon.scheduleUpgrade(address(beacon));
        vm.stopPrank();
    }

    function test_beacon_guardianChangeIsTimelocked() public {
        address rogue = makeAddr("rogue");
        vm.prank(coop);
        beacon.scheduleGuardianChange(rogue);
        assertEq(beacon.guardian(), guardian, "guardian replaced instantly");
        vm.expectRevert(BoardBeacon.GuardianChangeNotReady.selector);
        beacon.executeGuardianChange();

        vm.prank(guardian);
        beacon.cancelGuardianChange();
        vm.warp(block.timestamp + UPGRADE_DELAY);
        vm.expectRevert(BoardBeacon.NoPendingGuardian.selector);
        beacon.executeGuardianChange();

        vm.prank(coop);
        beacon.scheduleGuardianChange(rogue);
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeGuardianChange();
        assertEq(beacon.guardian(), rogue);

        vm.prank(rogue);
        beacon.resignGuardian();
        assertEq(beacon.guardian(), address(0));
    }

    function test_beacon_adminTransferIsTwoStep() public {
        address next = makeAddr("next-coop");
        vm.prank(coop);
        beacon.transferAdmin(next);
        assertEq(beacon.admin(), coop);
        vm.expectRevert(BoardBeacon.OnlyPendingAdmin.selector);
        beacon.acceptAdmin();
        vm.prank(next);
        beacon.acceptAdmin();
        assertEq(beacon.admin(), next);
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function test_pause_blocksInflowsButKeepsExitsOpen() public {
        address m = _newMarkee("hello", "m");
        address who = _backer("paused-backer");
        int96 rate = _rate(0.05 ether);
        _open(who, m, rate);
        uint256 depositBefore = board.backerDeposit(who);

        vm.prank(guardian);
        beacon.pauseBoard(address(board));
        assertTrue(beacon.isPaused(address(board)));

        vm.expectRevert(_paused(StreamingLeaderboard.createMarkee.selector));
        board.createMarkee("x", "y");

        address late = _backer("late-backer");
        vm.startPrank(late);
        vm.expectRevert(_paused(StreamingLeaderboard.depositBuffer.selector));
        board.depositBuffer(late, 1 ether);
        vm.expectRevert();
        CFA.createFlow(ETHX, late, address(board), rate, abi.encode(m));
        vm.stopPrank();

        vm.prank(who);
        vm.expectRevert();
        CFA.updateFlow(ETHX, who, address(board), rate * 2, abi.encode(m));

        address[] memory backers = new address[](1);
        backers[0] = who;
        vm.expectRevert(_paused(StreamingLeaderboard.settle.selector));
        board.settle(backers);
        vm.expectRevert(_paused(StreamingLeaderboard.claimTop.selector));
        board.claimTop(m);

        uint256 balanceBefore = IERC20(address(ETHX)).balanceOf(who);
        vm.startPrank(who);
        CFA.deleteFlow(ETHX, who, address(board), "");
        board.withdrawDeposit();
        vm.stopPrank();
        _notJailed();
        assertEq(board.backerDeposit(who), 0, "deposit not withdrawn while paused");
        assertGe(IERC20(address(ETHX)).balanceOf(who), balanceBefore + depositBefore, "deposit not returned");

        vm.prank(guardian);
        vm.expectRevert(BoardBeacon.OnlyAdmin.selector);
        beacon.unpauseBoard(address(board));
        vm.prank(coop);
        beacon.unpauseBoard(address(board));
        board.createMarkee("after", "unpause");
    }

    function test_pause_globalCoversEveryBoard() public {
        (address b2,) = factory.createLeaderboard(beneficiary, "Board Two", "GitHub", "github");
        vm.prank(guardian);
        beacon.pauseAll();
        vm.expectRevert(_paused(StreamingLeaderboard.createMarkee.selector));
        board.createMarkee("x", "y");
        vm.expectRevert(abi.encodeWithSelector(BoardBeacon.Paused.selector, b2, StreamingLeaderboard.createMarkee.selector));
        StreamingLeaderboard(payable(b2)).createMarkee("x", "y");
        assertEq(board.markeeCount(), 1, "views must keep working while paused");

        vm.prank(guardian);
        vm.expectRevert(BoardBeacon.OnlyAdmin.selector);
        beacon.unpauseAll();
        vm.prank(coop);
        beacon.unpauseAll();
        board.createMarkee("x", "y");
    }

    function test_pause_exitsCanNeverBecomePausable() public {
        bytes4[] memory s = new bytes4[](1);
        s[0] = ISuperApp.afterAgreementTerminated.selector;
        vm.startPrank(coop);
        vm.expectRevert(abi.encodeWithSelector(BoardBeacon.SelectorNotPausable.selector, s[0]));
        beacon.setPausable(s, true);
        s[0] = ISuperApp.beforeAgreementTerminated.selector;
        vm.expectRevert(abi.encodeWithSelector(BoardBeacon.SelectorNotPausable.selector, s[0]));
        beacon.setPausable(s, true);
        s[0] = StreamingLeaderboard.withdrawDeposit.selector;
        vm.expectRevert(abi.encodeWithSelector(BoardBeacon.SelectorNotPausable.selector, s[0]));
        beacon.setPausable(s, true);
        s[0] = StreamingLeaderboard.updateMessage.selector;
        beacon.setPausable(s, true);
        vm.stopPrank();
        assertTrue(beacon.isPausable(s[0]));
    }

    // ─── Forced migration of pre-beacon boards ────────────────────────────────

    struct Legacy {
        StreamingLeaderboard board;
        address admin;
        address beneficiary;
        address nativeMarkee;
        address paidMarkee;
        address backer;
    }

    /// @dev A board cloned straight from the plain implementation, as every live board is today, with a
    ///      native Markee, a migrated-in paid Markee, and a live stream.
    function _legacyBoard() internal returns (Legacy memory l) {
        l.admin = makeAddr("legacy-admin");
        l.beneficiary = makeAddr("legacy-beneficiary");

        vm.prank(admin);
        factory.setImplementations(plainImplementation, markeeImplementation);
        vm.prank(l.admin);
        (address b,) = factory.createLeaderboard(l.beneficiary, "Legacy Board", "GitHub", "github");
        vm.prank(admin);
        factory.setImplementations(boardImplementation, markeeImplementation);
        assertEq(_implOf(b), plainImplementation, "legacy board must be a plain clone");
        l.board = StreamingLeaderboard(payable(b));

        vm.startPrank(l.admin);
        l.board.setMinimumMonthlyRate(0.002 ether);
        l.board.setLegacyFloorConfig(4, 0, 0);
        vm.stopPrank();

        vm.prank(makeAddr("native-creator"));
        l.nativeMarkee = l.board.createMarkee("native message", "native");

        LeaderboardFactory lumpFactory =
            new LeaderboardFactory("Legacy", "legacy", REVNET_TERMINAL, REVNET_PROJECT, address(0), admin);
        (address lump,) = lumpFactory.createLeaderboard(beneficiary, "Lump");
        address payer = makeAddr("lump-payer");
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        l.paidMarkee = Leaderboard(lump).createMarkee{value: 0.04 ether}("paid message", "paid");
        Leaderboard(lump).migratePricingStrategy(l.paidMarkee, b);
        address[] memory arr = new address[](1);
        arr[0] = l.paidMarkee;
        l.board.registerExistingMarkees(arr);

        l.backer = _backer("legacy-backer");
        _fundApprove(l.backer, b);
        _openOn(l.board, l.backer, l.nativeMarkee, _rate(0.5 ether));
    }

    /// @dev Mirrors production: the implementation serving successors is bound to the migrator.
    function _migrator() internal returns (StreamingBoardMigrator m) {
        m = new StreamingBoardMigrator(coop, IStreamingFactoryRegistry(address(factory)), 0, 0);
        address bound = address(new StreamingLeaderboard(ISuperfluid(HOST), ETHX, address(m)));
        vm.prank(coop);
        beacon.scheduleUpgrade(bound);
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeUpgrade();
        vm.startPrank(coop);
        m.setSourceFactory(address(factory), true);
        m.setSourceImplementation(plainImplementation, true);
        m.setOperator(operator, true);
        vm.stopPrank();
    }

    function _copies(StreamingLeaderboard successor) internal view returns (address[] memory) {
        return successor.getMarkees(0, successor.markeeCount());
    }

    function test_migration_copiesLegacyBoardWithoutItsAdmin() public {
        Legacy memory l = _legacyBoard();
        StreamingBoardMigrator migrator = _migrator();

        vm.prank(operator);
        StreamingLeaderboard successor = StreamingLeaderboard(payable(migrator.migrate(address(l.board))));

        assertEq(_implOf(address(successor)), boardImplementation, "successor not beacon-backed");
        assertTrue(ISuperfluid(HOST).isApp(ISuperApp(address(successor))), "successor not a SuperApp");
        _notJailed(address(successor));
        assertEq(successor.admin(), l.admin, "admin not handed to the legacy admin");
        assertEq(successor.beneficiaryAddress(), l.beneficiary);
        assertEq(successor.leaderboardName(), "Legacy Board");
        assertEq(successor.minimumMonthlyRate(), 0.002 ether);
        assertEq(successor.legacyFloorMonths(), 4);
        (string memory pName, string memory pId) = factory.boardPlatform(address(successor));
        assertEq(pName, "GitHub");
        assertEq(pId, "github");

        assertEq(migrator.successorOf(address(l.board)), address(successor));
        assertEq(migrator.predecessorOf(address(successor)), address(l.board));
        assertEq(uint256(migrator.status(address(l.board))), uint256(BoardMigratorBase.Status.Finished));

        address nativeCopy = migrator.markeeSuccessorOf(l.nativeMarkee);
        address paidCopy = migrator.markeeSuccessorOf(l.paidMarkee);
        assertTrue(successor.isMarkeeOnLeaderboard(nativeCopy) && successor.isMarkeeOnLeaderboard(paidCopy));
        assertEq(successor.markeeCount(), 3, "expected seed + two copies (legacy empty seed skipped)");
        assertEq(Markee(paidCopy).owner(), Markee(l.paidMarkee).owner());
        assertEq(Markee(paidCopy).message(), "paid message");
        assertEq(Markee(paidCopy).name(), "paid");
        assertEq(Markee(paidCopy).totalFundsAdded(), 0.04 ether);
        assertEq(Markee(nativeCopy).message(), "native message");
        assertEq(Markee(paidCopy).pricingStrategy(), address(successor));
        assertGt(successor.legacyFloorRate0(paidCopy), 0, "carried total did not become a floor");
        assertEq(successor.topMarkee(), paidCopy, "floor did not seed #1");

        address seed = migrator.seedOf(address(successor));
        assertEq(Markee(seed).owner(), l.admin, "seed not handed to the legacy admin");

        assertEq(l.board.admin(), l.admin, "legacy board was modified");
        assertEq(l.board.aggregateRate(l.nativeMarkee), uint256(uint96(_rate(0.5 ether))), "legacy stream moved");
        _notJailed(address(l.board));

        vm.prank(l.admin);
        successor.setBeneficiaryAddress(l.beneficiary);
    }

    function test_migration_isChunkableAndIdempotent() public {
        Legacy memory l = _legacyBoard();
        StreamingBoardMigrator migrator = _migrator();

        vm.startPrank(operator);
        StreamingLeaderboard successor = StreamingLeaderboard(payable(migrator.startMigration(address(l.board))));
        migrator.importMarkees(address(l.board), 0, 1);
        migrator.importMarkees(address(l.board), 0, 10);
        migrator.importMarkees(address(l.board), 0, 10);
        migrator.importMarkees(address(l.board), 50, 10);
        assertEq(successor.admin(), address(migrator), "admin handed over before finish");
        migrator.finishMigration(address(l.board));
        vm.expectRevert(BoardMigratorBase.NotImporting.selector);
        migrator.importMarkees(address(l.board), 0, 10);
        vm.stopPrank();

        assertEq(successor.markeeCount(), 3, "duplicate copies on re-import");
        assertEq(successor.admin(), l.admin);
    }

    function test_migration_cannotFinishWithMissingMarkees() public {
        Legacy memory l = _legacyBoard();
        StreamingBoardMigrator migrator = _migrator();

        vm.startPrank(operator);
        migrator.startMigration(address(l.board));
        vm.expectRevert();
        migrator.finishMigration(address(l.board));
        vm.stopPrank();

        address[] memory legacyMarkees = l.board.getMarkees(0, l.board.markeeCount());
        vm.startPrank(coop);
        for (uint256 i = 0; i < legacyMarkees.length; i++) {
            migrator.excludeMarkee(address(l.board), legacyMarkees[i]);
        }
        vm.stopPrank();
        vm.prank(operator);
        vm.expectRevert(BoardMigratorBase.OnlyOwner.selector);
        migrator.excludeMarkee(address(l.board), l.paidMarkee);

        vm.prank(operator);
        migrator.finishMigration(address(l.board));
        assertEq(StreamingLeaderboard(payable(migrator.successorOf(address(l.board)))).markeeCount(), 1);
    }

    function test_migration_onlyMigratorRegistersMarkees() public {
        Legacy memory l = _legacyBoard();
        StreamingBoardMigrator migrator = _migrator();
        vm.prank(operator);
        StreamingLeaderboard successor = StreamingLeaderboard(payable(migrator.migrate(address(l.board))));

        Markee outside = Markee(_cloneOf(markeeImplementation));
        outside.initialize(l.admin, address(successor), "m", "n", 1 ether);
        address[] memory arr = new address[](1);
        arr[0] = address(outside);
        vm.prank(l.admin);
        vm.expectRevert(StreamingLeaderboard.OnlyMigrator.selector);
        successor.registerExistingMarkees(arr);
        vm.expectRevert(StreamingLeaderboard.OnlyMigrator.selector);
        successor.registerExistingMarkees(arr);
        assertFalse(successor.isMarkeeOnLeaderboard(address(outside)));
    }

    function _cloneOf(address impl) internal returns (address instance) {
        assembly {
            mstore(0x00, or(shr(0xe8, shl(0x60, impl)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            mstore(0x20, or(shl(0x78, impl), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(0, 0x09, 0x37)
        }
    }

    function test_migration_rejectsUnauthorizedAndUnknownBoards() public {
        Legacy memory l = _legacyBoard();
        StreamingBoardMigrator migrator = _migrator();

        vm.expectRevert(BoardMigratorBase.OnlyOperator.selector);
        migrator.migrate(address(l.board));

        vm.prank(operator);
        address successor = migrator.migrate(address(l.board));
        vm.startPrank(operator);
        vm.expectRevert(BoardMigratorBase.AlreadyStarted.selector);
        migrator.migrate(address(l.board));
        vm.expectRevert(BoardMigratorBase.UnknownSourceBoard.selector);
        migrator.migrate(successor);
        vm.stopPrank();

        StreamingBoardMigrator unapproved = new StreamingBoardMigrator(coop, IStreamingFactoryRegistry(address(factory)), 0, 0);
        vm.prank(coop);
        vm.expectRevert(BoardMigratorBase.UnknownSourceBoard.selector);
        unapproved.migrate(address(board));

        vm.prank(operator);
        vm.expectRevert(BoardMigratorBase.OnlyOwner.selector);
        migrator.setOperator(operator, true);
    }
}
