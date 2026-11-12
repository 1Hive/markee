// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Test, Vm } from "forge-std/Test.sol";

import { Leaderboard } from "../contracts/v1.4/Leaderboard.sol";
import { Leaderboard as LeaderboardV13 } from "../contracts/v1.3/Leaderboard.sol";
import { Markee } from "../contracts/v1.3/Markee.sol";
import { LeaderboardFactory as LeaderboardFactoryV13 } from "../contracts/v1.3/LeaderboardFactory.sol";
import { LeaderboardFactory as LeaderboardFactoryV14 } from "../contracts/v1.4/LeaderboardFactory.sol";
import { BoardBeacon } from "../contracts/upgrade/BoardBeacon.sol";
import { LeaderboardBeacon } from "../contracts/upgrade/LeaderboardBeacon.sol";
import { BeaconForwarder, IBoardRouter } from "../contracts/upgrade/BeaconForwarder.sol";
import { BoardMigratorBase } from "../contracts/upgrade/BoardMigratorBase.sol";
import { LeaderboardMigrator, IMigrationLeaderboardFactory } from "../contracts/upgrade/LeaderboardMigrator.sol";
import { SunsetTerminal } from "../contracts/upgrade/SunsetTerminal.sol";

contract UnregisteredBoard {
    address public immutable factory;
    address public admin;

    constructor(address _factory) {
        factory = _factory;
        admin = msg.sender;
    }
}

contract ExternalMarkee {
    address public owner = msg.sender;
    string public message = "m";
    string public name = "n";
    uint256 public totalFundsAdded = 1 ether;
    address public pricingStrategy;

    function setPricingStrategy(address _strategy) external {
        pricingStrategy = _strategy;
    }

    function pay(address) external payable {}
}

contract LeaderboardV2Probe is Leaderboard {
    function probeVersion() external pure returns (string memory) {
        return "1.4-probe";
    }
}

contract SilentFallbackImplementation is Leaderboard {
    fallback() external {}
}

contract NonContractBeaconImplementation is Leaderboard {
    function boardBeacon() external pure returns (address) {
        return address(0xb0a2d);
    }
}

/// @notice v1.4 lump-sum boards behind a LeaderboardBeacon, and forced migration of v1.3 boards.
///         RevNet routing is disabled on both factories, so pay() sends everything to the beneficiary
///         and no fork is needed.
contract LeaderboardBeaconTest is Test {
    uint256 constant UPGRADE_DELAY = 2 days;
    address constant DUMMY_TERMINAL = address(0x7e57);

    address coop = makeAddr("coop");
    address guardian = makeAddr("guardian");
    address operator = makeAddr("operator");
    address legacyAdmin = makeAddr("legacy-admin");
    address legacyBeneficiary = makeAddr("legacy-beneficiary");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    LeaderboardFactoryV13 legacyFactory;
    LeaderboardFactoryV14 factory;
    LeaderboardBeacon beacon;
    address forwarder;
    address leaderboardImplementation;
    LeaderboardMigrator migrator;

    LeaderboardV13 legacy;
    address aliceMarkee;
    address bobMarkee;

    function setUp() public {
        legacyFactory = new LeaderboardFactoryV13("Superfluid", "superfluid", DUMMY_TERMINAL, 7, coop, coop);
        vm.prank(coop);
        legacyFactory.setRevNetEnabled(false);

        vm.prank(legacyAdmin);
        (address l,) = legacyFactory.createLeaderboard(legacyBeneficiary, "Legacy Board");
        legacy = LeaderboardV13(l);
        vm.startPrank(legacyAdmin);
        legacy.setMinimumPrice(0.002 ether);
        legacy.setMaxMessageLength(140);
        legacy.setMaxNameLength(16);
        vm.stopPrank();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.prank(alice);
        aliceMarkee = legacy.createMarkee{value: 0.5 ether}("alice says hi", "alice");
        vm.prank(bob);
        bobMarkee = legacy.createMarkee{value: 0.2 ether}("bob was here", "bob");
        vm.prank(bob);
        legacy.addFunds{value: 0.1 ether}(bobMarkee);

        leaderboardImplementation = address(new Leaderboard());
        beacon = new LeaderboardBeacon(leaderboardImplementation, coop, guardian, UPGRADE_DELAY, _pausableSelectors());
        forwarder = address(new BeaconForwarder(IBoardRouter(address(beacon)), false));
        factory = new LeaderboardFactoryV14(
            "Superfluid", "superfluid", forwarder, address(new Markee()), DUMMY_TERMINAL, 7, coop, coop
        );
        migrator = new LeaderboardMigrator(coop, IMigrationLeaderboardFactory(address(factory)));

        vm.startPrank(coop);
        factory.setRevNetEnabled(false);
        factory.setMigrator(address(migrator));
        migrator.setSourceFactory(address(legacyFactory), true);
        migrator.setOperator(operator, true);
        vm.stopPrank();
    }

    function _pausableSelectors() internal pure returns (bytes4[] memory s) {
        s = new bytes4[](2);
        s[0] = Leaderboard.createMarkee.selector;
        s[1] = Leaderboard.addFunds.selector;
    }

    function _migrate() internal returns (Leaderboard successor) {
        vm.prank(operator);
        successor = Leaderboard(migrator.migrate(address(legacy)));
    }

    // ─── v1.4 boards ──────────────────────────────────────────────────────────

    function test_v14_boardsRunThroughBeacon() public {
        (address b, address seed) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);
        assertEq(board.VERSION(), "1.4.0");
        assertEq(board.factory(), address(factory));
        assertEq(board.admin(), address(this));
        assertEq(Markee(seed).owner(), address(this));

        uint256 beneficiaryBefore = alice.balance;
        vm.prank(bob);
        address m = board.createMarkee{value: 0.01 ether}("hello", "bob");
        assertEq(Markee(m).totalFundsAdded(), 0.01 ether);
        assertEq(alice.balance, beneficiaryBefore + 0.01 ether, "beneficiary not paid through forwarder");
    }

    function test_v14_forwarderRejectsPlainEthAndDirectInitialize() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        vm.prank(bob);
        (bool ok,) = b.call{value: 1 ether}("");
        assertFalse(ok, "lump-sum board must not swallow plain ETH");

        vm.expectRevert();
        Leaderboard(forwarder).initialize(alice, alice, "x", address(1), 0, 1, 1, alice);
    }

    function test_v14_upgradeAppliesToEveryBoard() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard successor = _migrate();
        address v2 = address(new LeaderboardV2Probe());

        vm.prank(coop);
        beacon.scheduleUpgrade(v2);
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeUpgrade();

        assertEq(LeaderboardV2Probe(b).probeVersion(), "1.4-probe");
        assertEq(LeaderboardV2Probe(address(successor)).probeVersion(), "1.4-probe");
        assertEq(successor.admin(), legacyAdmin, "storage lost across upgrade");
        assertEq(successor.markeeCount(), 3);
    }

    function test_v14_rescheduleUpgradeCancelsThePendingOne() public {
        address first = address(new LeaderboardV2Probe());
        address second = address(new LeaderboardV2Probe());

        vm.prank(coop);
        beacon.scheduleUpgrade(first);
        vm.warp(block.timestamp + UPGRADE_DELAY - 1);

        vm.expectEmit(true, false, false, false, address(beacon));
        emit BoardBeacon.UpgradeCancelled(first);
        vm.expectEmit(true, false, false, true, address(beacon));
        emit BoardBeacon.UpgradeScheduled(second, block.timestamp + UPGRADE_DELAY);
        vm.prank(coop);
        beacon.scheduleUpgrade(second);

        assertEq(beacon.pendingImplementation(), second);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(BoardBeacon.UpgradeNotReady.selector);
        beacon.executeUpgrade();
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeUpgrade();
        assertEq(beacon.implementation(), second);
    }

    function test_v14_firstScheduleEmitsNoCancellation() public {
        address v2 = address(new LeaderboardV2Probe());
        vm.recordLogs();
        vm.prank(coop);
        beacon.scheduleUpgrade(v2);
        vm.prank(coop);
        beacon.scheduleGuardianChange(alice);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[0], BoardBeacon.UpgradeScheduled.selector);
        assertEq(logs[1].topics[0], BoardBeacon.GuardianChangeScheduled.selector);
    }

    function test_v14_rescheduleGuardianChangeCancelsThePendingOne() public {
        vm.prank(coop);
        beacon.scheduleGuardianChange(alice);
        vm.warp(block.timestamp + UPGRADE_DELAY - 1);

        vm.expectEmit(true, false, false, false, address(beacon));
        emit BoardBeacon.GuardianChangeCancelled(alice);
        vm.expectEmit(true, false, false, true, address(beacon));
        emit BoardBeacon.GuardianChangeScheduled(bob, block.timestamp + UPGRADE_DELAY);
        vm.prank(coop);
        beacon.scheduleGuardianChange(bob);

        vm.warp(block.timestamp + 1);
        vm.expectRevert(BoardBeacon.GuardianChangeNotReady.selector);
        beacon.executeGuardianChange();
        vm.warp(block.timestamp + UPGRADE_DELAY);
        beacon.executeGuardianChange();
        assertEq(beacon.guardian(), bob);
    }

    function test_v14_rejectsForwardersOfAnyBeacon() public {
        LeaderboardBeacon other =
            new LeaderboardBeacon(leaderboardImplementation, coop, guardian, UPGRADE_DELAY, _pausableSelectors());
        address otherForwarder = address(new BeaconForwarder(IBoardRouter(address(other)), false));

        vm.startPrank(coop);
        vm.expectRevert(BoardBeacon.ImplementationIsForwarder.selector);
        beacon.scheduleUpgrade(forwarder);
        vm.expectRevert(BoardBeacon.ImplementationIsForwarder.selector);
        beacon.scheduleUpgrade(otherForwarder);
        vm.expectRevert(BoardBeacon.ImplementationIsForwarder.selector);
        beacon.scheduleUpgrade(address(beacon));
        vm.stopPrank();
    }

    function test_v14_acceptsImplementationsThatOnlyLookLikeForwarders() public {
        address silent = address(new SilentFallbackImplementation());
        address nonContract = address(new NonContractBeaconImplementation());

        vm.startPrank(coop);
        beacon.scheduleUpgrade(silent);
        assertEq(beacon.pendingImplementation(), silent);
        beacon.scheduleUpgrade(nonContract);
        assertEq(beacon.pendingImplementation(), nonContract);
        vm.stopPrank();
    }

    function test_v14_getMarkeesPaginatesPastTheEnd() public {
        Leaderboard successor = _migrate();
        uint256 count = successor.markeeCount();

        assertEq(successor.getMarkees(0, type(uint256).max).length, count);
        assertEq(successor.getMarkees(1, type(uint256).max).length, count - 1);
        assertEq(successor.getMarkees(count - 1, 10).length, 1);
        assertEq(successor.getMarkees(count, 10).length, 0);
        assertEq(successor.getMarkees(count + 5, 10).length, 0);
        assertEq(successor.getMarkees(type(uint256).max, type(uint256).max).length, 0);
        assertEq(successor.getMarkees(0, 0).length, 0);
    }

    function test_v14_pauseBlocksPaymentsOnly() public {
        Leaderboard successor = _migrate();
        address aliceCopy = migrator.markeeSuccessorOf(aliceMarkee);

        vm.prank(guardian);
        beacon.pauseBoard(address(successor));

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(BoardBeacon.Paused.selector, address(successor), Leaderboard.createMarkee.selector)
        );
        successor.createMarkee{value: 0.01 ether}("x", "y");
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(BoardBeacon.Paused.selector, address(successor), Leaderboard.addFunds.selector)
        );
        successor.addFunds{value: 0.01 ether}(aliceCopy);

        vm.prank(alice);
        successor.updateMessage(aliceCopy, "still editable");
        assertEq(Markee(aliceCopy).message(), "still editable");

        vm.prank(coop);
        beacon.unpauseBoard(address(successor));
        vm.prank(bob);
        successor.addFunds{value: 0.01 ether}(aliceCopy);
    }

    function test_v14_boardAdminCannotImportMarkees() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        ExternalMarkee outside = new ExternalMarkee();
        outside.setPricingStrategy(b);

        vm.expectRevert("Only migrator");
        Leaderboard(b).migrateFromLegacy(address(outside));
        address[] memory arr = new address[](1);
        arr[0] = address(outside);
        vm.expectRevert("Only migrator");
        Leaderboard(b).initializeHistory(arr);

        Leaderboard successor = _migrate();
        vm.prank(legacyAdmin);
        vm.expectRevert("Only migrator");
        successor.migrateFromLegacy(address(outside));
        assertEq(successor.totalLeaderboardFunds(), 0.8 ether);
    }

    function test_v14_implementationIsLocked() public {
        vm.expectRevert("Already initialized");
        Leaderboard(leaderboardImplementation).initialize(alice, alice, "x", address(1), 0, 1, 1, alice);
    }

    function test_v14_onlyMigratorCreatesMigrationBoards() public {
        vm.expectRevert("Only migrator");
        factory.createMigrationLeaderboard(alice, alice, "x");
        vm.expectRevert("Only factory admin");
        factory.setMigrator(address(this));
    }

    // ─── Admin transfer ───────────────────────────────────────────────────────

    function test_v14_setAdminOnlyProposes() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);

        vm.expectEmit(true, true, false, false, b);
        emit Leaderboard.AdminTransferStarted(address(this), alice);
        board.setAdmin(alice);

        assertEq(board.admin(), address(this), "admin changed before accept");
        assertEq(board.pendingAdmin(), alice);

        vm.expectRevert("Admin cannot be zero address");
        board.setAdmin(address(0));
        vm.prank(alice);
        vm.expectRevert("Only admin");
        board.setAdmin(bob);
    }

    function test_v14_acceptAdminCompletesTransfer() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);
        board.setAdmin(alice);

        vm.prank(bob);
        vm.expectRevert("Only pending admin");
        board.acceptAdmin();
        vm.expectRevert("Only pending admin");
        board.acceptAdmin();

        vm.expectEmit(true, true, false, false, b);
        emit Leaderboard.AdminChanged(address(this), alice);
        vm.prank(alice);
        board.acceptAdmin();

        assertEq(board.admin(), alice);
        assertEq(board.pendingAdmin(), address(0));
        vm.prank(alice);
        vm.expectRevert("Only pending admin");
        board.acceptAdmin();
    }

    function test_v14_oldAdminKeepsControlUntilAccepted() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);
        board.setAdmin(alice);

        board.setMinimumPrice(1 ether);
        assertEq(board.minimumPrice(), 1 ether);
        vm.prank(alice);
        vm.expectRevert("Only admin");
        board.setMinimumPrice(2 ether);

        vm.prank(alice);
        board.acceptAdmin();
        vm.expectRevert("Only admin");
        board.setMinimumPrice(3 ether);
        vm.prank(alice);
        board.setMinimumPrice(3 ether);
        assertEq(board.minimumPrice(), 3 ether);
    }

    function test_v14_setAdminRetargetsThePendingAdmin() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);
        board.setAdmin(alice);
        board.setAdmin(bob);
        assertEq(board.pendingAdmin(), bob);

        vm.prank(alice);
        vm.expectRevert("Only pending admin");
        board.acceptAdmin();
        vm.prank(bob);
        board.acceptAdmin();
        assertEq(board.admin(), bob);
    }

    function test_v14_cancelAdminTransfer() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);

        vm.expectRevert("No pending admin");
        board.cancelAdminTransfer();

        board.setAdmin(alice);
        vm.prank(alice);
        vm.expectRevert("Only admin");
        board.cancelAdminTransfer();

        vm.expectEmit(true, true, false, false, b);
        emit Leaderboard.AdminTransferCancelled(address(this), alice);
        board.cancelAdminTransfer();
        assertEq(board.pendingAdmin(), address(0));
        assertEq(board.admin(), address(this));

        vm.prank(alice);
        vm.expectRevert("Only pending admin");
        board.acceptAdmin();
    }

    function test_v14_handOffAdminRequiresMigratorThatIsAdmin() public {
        (address b,) = factory.createLeaderboard(alice, "Fresh");
        Leaderboard board = Leaderboard(b);

        vm.expectRevert("Only migrator");
        board.handOffAdmin(alice);
        vm.prank(alice);
        vm.expectRevert("Only migrator");
        board.handOffAdmin(alice);

        vm.prank(address(migrator));
        vm.expectRevert("Only admin");
        board.handOffAdmin(alice);
        assertEq(board.admin(), address(this));

        Leaderboard successor = _migrate();
        vm.prank(address(migrator));
        vm.expectRevert("Only admin");
        successor.handOffAdmin(alice);
        vm.prank(legacyAdmin);
        vm.expectRevert("Only migrator");
        successor.handOffAdmin(alice);
        assertEq(successor.admin(), legacyAdmin);
    }

    function test_migration_handsOffAdminWithoutAcceptance() public {
        vm.expectEmit(false, true, true, false);
        emit Leaderboard.AdminChanged(address(migrator), legacyAdmin);
        Leaderboard successor = _migrate();
        assertEq(successor.admin(), legacyAdmin);
        assertEq(successor.pendingAdmin(), address(0));

        vm.prank(legacyAdmin);
        successor.setAdmin(alice);
        assertEq(successor.admin(), legacyAdmin);
        vm.prank(alice);
        successor.acceptAdmin();
        assertEq(successor.admin(), alice);
    }

    // ─── Forced migration ─────────────────────────────────────────────────────

    function test_migration_copiesBoardWithoutLegacyAdmin() public {
        Leaderboard successor = _migrate();

        assertEq(_implOf(address(successor)), forwarder, "successor not beacon-backed");
        assertEq(successor.admin(), legacyAdmin);
        assertEq(successor.beneficiaryAddress(), legacyBeneficiary);
        assertEq(successor.leaderboardName(), "Legacy Board");
        assertEq(successor.minimumPrice(), 0.002 ether);
        assertEq(successor.maxMessageLength(), 140);
        assertEq(successor.maxNameLength(), 16);
        assertTrue(factory.isFactoryLeaderboard(address(successor)));

        assertEq(successor.markeeCount(), 3, "expected new seed + alice + bob");
        address seed = successor.markees(0);
        assertEq(Markee(seed).owner(), legacyAdmin, "seed not owned by legacy admin");

        address aliceCopy = migrator.markeeSuccessorOf(aliceMarkee);
        address bobCopy = migrator.markeeSuccessorOf(bobMarkee);
        assertEq(Markee(aliceCopy).owner(), alice);
        assertEq(Markee(aliceCopy).message(), "alice says hi");
        assertEq(Markee(aliceCopy).name(), "alice");
        assertEq(Markee(aliceCopy).totalFundsAdded(), 0.5 ether);
        assertEq(Markee(bobCopy).totalFundsAdded(), 0.3 ether);
        assertEq(Markee(bobCopy).pricingStrategy(), address(successor));
        assertEq(successor.totalLeaderboardFunds(), 0.8 ether);

        (address[] memory top,) = successor.getTopMarkees(2);
        assertEq(top[0], aliceCopy);
        assertEq(top[1], bobCopy);

        vm.prank(alice);
        successor.updateMessage(aliceCopy, "edited on the successor");
        vm.prank(bob);
        successor.addFunds{value: 0.3 ether}(bobCopy);
        assertEq(Markee(bobCopy).totalFundsAdded(), 0.6 ether);

        assertEq(legacy.admin(), legacyAdmin, "legacy board was modified");
        assertEq(Markee(aliceMarkee).pricingStrategy(), address(legacy), "legacy markee was moved");
    }

    function test_migration_skipsMarkeesOwnedByAnotherBoard() public {
        vm.prank(legacyAdmin);
        (address other,) = legacyFactory.createLeaderboard(legacyBeneficiary, "Squatter");
        address[] memory stolen = new address[](1);
        stolen[0] = aliceMarkee;
        vm.prank(legacyAdmin);
        LeaderboardV13(other).initializeHistory(stolen);
        assertTrue(LeaderboardV13(other).isMarkeeOnLeaderboard(aliceMarkee));

        vm.prank(operator);
        Leaderboard squatter = Leaderboard(migrator.migrate(other));
        assertEq(squatter.markeeCount(), 1, "foreign markee copied");
        assertEq(migrator.markeeSuccessorOf(aliceMarkee), address(0));

        Leaderboard successor = _migrate();
        assertTrue(successor.isMarkeeOnLeaderboard(migrator.markeeSuccessorOf(aliceMarkee)), "owner board lost it");
    }

    function test_migration_rejectsBoardsOutsideApprovedFactories() public {
        UnregisteredBoard unregistered = new UnregisteredBoard(address(legacyFactory));
        vm.prank(operator);
        vm.expectRevert(BoardMigratorBase.UnknownSourceBoard.selector);
        migrator.migrate(address(unregistered));

        LeaderboardFactoryV13 other = new LeaderboardFactoryV13("Other", "other", DUMMY_TERMINAL, 7, coop, coop);
        (address foreign,) = other.createLeaderboard(alice, "Foreign");
        vm.prank(operator);
        vm.expectRevert(BoardMigratorBase.UnknownSourceBoard.selector);
        migrator.migrate(foreign);

        vm.expectRevert(BoardMigratorBase.OnlyOperator.selector);
        migrator.migrate(address(legacy));
    }

    function test_factoryAdmin_isTwoStep() public {
        address next = makeAddr("next-coop");
        vm.prank(coop);
        factory.setFactoryAdmin(next);
        assertEq(factory.factoryAdmin(), coop);
        assertEq(factory.pendingFactoryAdmin(), next);

        vm.prank(coop);
        factory.setRevNetEnabled(true);

        vm.expectRevert("Only pending factory admin");
        factory.acceptFactoryAdmin();

        vm.prank(next);
        factory.acceptFactoryAdmin();
        assertEq(factory.factoryAdmin(), next);
        assertEq(factory.pendingFactoryAdmin(), address(0));

        vm.prank(coop);
        vm.expectRevert("Only factory admin");
        factory.setRevNetEnabled(false);
    }

    function test_factoryAdmin_retargetReplacesPending() public {
        address first = makeAddr("first");
        address second = makeAddr("second");
        vm.startPrank(coop);
        factory.setFactoryAdmin(first);
        factory.setFactoryAdmin(second);
        vm.stopPrank();

        vm.prank(first);
        vm.expectRevert("Only pending factory admin");
        factory.acceptFactoryAdmin();

        vm.prank(second);
        factory.acceptFactoryAdmin();
        assertEq(factory.factoryAdmin(), second);
    }

    function test_getLeaderboards_clampsPagination() public {
        factory.createLeaderboard(address(this), "one");
        factory.createLeaderboard(address(this), "two");
        uint256 count = factory.leaderboardCount();

        assertEq(factory.getLeaderboards(count, 10).length, 0);
        assertEq(factory.getLeaderboards(count + 5, 10).length, 0);
        assertEq(factory.getLeaderboards(type(uint256).max, type(uint256).max).length, 0);
        assertEq(factory.getLeaderboards(0, type(uint256).max).length, count);
        assertEq(factory.getLeaderboards(count - 1, type(uint256).max).length, 1);
        assertEq(factory.getLeaderboards(0, 0).length, 0);
    }

    function test_migration_ownershipIsTwoStep() public {
        address next = makeAddr("next-coop");
        vm.prank(coop);
        migrator.transferOwnership(next);
        vm.expectRevert(BoardMigratorBase.OnlyPendingOwner.selector);
        migrator.acceptOwnership();
        vm.prank(next);
        migrator.acceptOwnership();
        assertEq(migrator.owner(), next);
    }

    function test_sunset_freezesLegacyFactoryPayments() public {
        _migrate();
        SunsetTerminal sunset = new SunsetTerminal(address(migrator));
        vm.startPrank(coop);
        legacyFactory.setRevNetTerminal(address(sunset));
        legacyFactory.setRevNetEnabled(true);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SunsetTerminal.BoardSunset.selector, address(migrator)));
        legacy.addFunds{value: 0.1 ether}(bobMarkee);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SunsetTerminal.BoardSunset.selector, address(migrator)));
        legacy.createMarkee{value: 0.01 ether}("late", "late");
    }

    function _implOf(address proxy) internal view returns (address impl) {
        bytes memory code = proxy.code;
        assertEq(code.length, 45, "not an EIP-1167 clone");
        assembly {
            impl := shr(96, mload(add(code, 0x2a)))
        }
    }
}
