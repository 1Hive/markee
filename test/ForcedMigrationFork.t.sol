// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Test } from "forge-std/Test.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperApp.sol";

import { StreamingLeaderboardFactory } from "../contracts/streaming/StreamingLeaderboardFactory.sol";
import { StreamingLeaderboard } from "../contracts/v1.3/streaming/StreamingLeaderboard.sol";
import { Leaderboard } from "../contracts/v1.4/Leaderboard.sol";
import { Leaderboard as LeaderboardV13 } from "../contracts/v1.3/Leaderboard.sol";
import { Markee } from "../contracts/v1.3/Markee.sol";
import { LeaderboardFactory as LeaderboardFactoryV13 } from "../contracts/v1.3/LeaderboardFactory.sol";
import { LeaderboardFactory as LeaderboardFactoryV14 } from "../contracts/v1.4/LeaderboardFactory.sol";
import { StreamingBoardBeacon } from "../contracts/upgrade/StreamingBoardBeacon.sol";
import { LeaderboardBeacon } from "../contracts/upgrade/LeaderboardBeacon.sol";
import { BeaconForwarder, IBoardRouter } from "../contracts/upgrade/BeaconForwarder.sol";
import { BoardMigratorBase } from "../contracts/upgrade/BoardMigratorBase.sol";
import { StreamingBoardMigrator, IStreamingFactoryRegistry } from "../contracts/upgrade/StreamingBoardMigrator.sol";
import { LeaderboardMigrator, IMigrationLeaderboardFactory } from "../contracts/upgrade/LeaderboardMigrator.sol";

/// @notice Dry run of the forced migration against live Base state: every live board on the streaming
///         factory and on the four v1.3 lump-sum factories is migrated to a beacon-backed successor.
/// Run: BASE_RPC_URL=<base-rpc> forge test --match-contract ForcedMigrationForkTest
contract ForcedMigrationForkTest is Test {
    address constant HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    ISuperToken constant ETHX = ISuperToken(0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93);
    address constant COOP = 0xAf4401E765dFf079aB6021BBb8d46E53E27613DB;
    address constant REVNET_TERMINAL = 0x130f5Dd2bD8805443Cf41755253D778a75a67f53;
    uint256 constant REVNET_PROJECT = 7;

    StreamingLeaderboardFactory constant STREAMING_FACTORY =
        StreamingLeaderboardFactory(0x37f420fdE5c98e611EB7cb9b74ef579D84697039);
    address constant FACTORY_SUPERFLUID = 0xC497187AAa35C26b0008B43C10A6F6300b7eBcad;
    address constant FACTORY_OPEN_INTERNET = 0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c;
    address constant FACTORY_GITHUB = 0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2;
    address constant FACTORY_FOR_SALE = 0x861D9897eC47421aAFB6321Ee219E88ab485121f;

    uint256 constant DEFAULT_FORK_BLOCK = 55260833;

    address operator = makeAddr("operator");
    uint256 maxGas;

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_RPC_URL"), vm.envOr("FORK_BLOCK", DEFAULT_FORK_BLOCK));
    }

    function _nonEmpty(address[] memory markees) internal view returns (uint256 n) {
        for (uint256 i = 0; i < markees.length; i++) {
            Markee m = Markee(markees[i]);
            if (m.totalFundsAdded() > 0 || bytes(m.message()).length > 0 || bytes(m.name()).length > 0) n++;
        }
    }

    function test_fork_migratesEveryLiveStreamingBoard() public {
        StreamingBoardMigrator migrator =
            new StreamingBoardMigrator(COOP, IStreamingFactoryRegistry(address(STREAMING_FACTORY)), 0, 0);
        address plain = address(new StreamingLeaderboard(ISuperfluid(HOST), ETHX, address(migrator)));
        bytes4[] memory pausable = new bytes4[](2);
        pausable[0] = StreamingLeaderboard.createMarkee.selector;
        pausable[1] = ISuperApp.afterAgreementCreated.selector;
        StreamingBoardBeacon beacon =
            new StreamingBoardBeacon(ISuperfluid(HOST), ETHX, plain, COOP, COOP, 2 days, pausable);
        address forwarder = address(new BeaconForwarder(IBoardRouter(address(beacon)), true));

        uint256 legacyCount = STREAMING_FACTORY.leaderboardCount();
        address[] memory boards = STREAMING_FACTORY.getLeaderboards(0, legacyCount);

        vm.startPrank(COOP);
        migrator.setSourceImplementation(STREAMING_FACTORY.leaderboardImplementation(), true);
        STREAMING_FACTORY.setImplementations(forwarder, STREAMING_FACTORY.markeeImplementation());
        migrator.setSourceFactory(address(STREAMING_FACTORY), true);
        migrator.setOperator(operator, true);
        vm.stopPrank();

        for (uint256 i = 0; i < boards.length; i++) {
            StreamingLeaderboard legacy = StreamingLeaderboard(payable(boards[i]));
            address[] memory legacyMarkees = legacy.getMarkees(0, legacy.markeeCount());

            vm.prank(operator);
            uint256 gasBefore = gasleft();
            StreamingLeaderboard successor = StreamingLeaderboard(payable(migrator.migrate(boards[i])));
            maxGas = _max(maxGas, gasBefore - gasleft());

            assertTrue(ISuperfluid(HOST).isApp(ISuperApp(address(successor))), "successor not a SuperApp");
            assertFalse(ISuperfluid(HOST).isAppJailed(ISuperApp(address(successor))), "successor jailed");
            assertEq(successor.admin(), legacy.admin(), "admin not handed over");
            assertEq(successor.beneficiaryAddress(), legacy.beneficiaryAddress());
            assertEq(successor.markeeCount(), _nonEmpty(legacyMarkees) + 1, "markee count mismatch");
            assertEq(successor.totalLeaderboardFunds(), legacy.totalLeaderboardFunds(), "carried totals mismatch");
        }
        assertEq(STREAMING_FACTORY.leaderboardCount(), legacyCount * 2);
        emit log_named_uint("max gas per streaming migration", maxGas);
    }

    function test_fork_migratesEveryLiveLumpSumBoard() public {
        address[4] memory legacyFactories =
            [FACTORY_SUPERFLUID, FACTORY_OPEN_INTERNET, FACTORY_GITHUB, FACTORY_FOR_SALE];
        bytes4[] memory pausable = new bytes4[](2);
        pausable[0] = Leaderboard.createMarkee.selector;
        pausable[1] = Leaderboard.addFunds.selector;
        LeaderboardBeacon beacon = new LeaderboardBeacon(address(new Leaderboard()), COOP, COOP, 2 days, pausable);
        address forwarder = address(new BeaconForwarder(IBoardRouter(address(beacon)), false));
        address markeeImpl = address(new Markee());

        uint256 migrated;
        for (uint256 f = 0; f < legacyFactories.length; f++) {
            LeaderboardFactoryV13 legacyFactory = LeaderboardFactoryV13(legacyFactories[f]);
            LeaderboardFactoryV14 factory = new LeaderboardFactoryV14(
                legacyFactory.platformName(),
                legacyFactory.platformId(),
                forwarder,
                markeeImpl,
                REVNET_TERMINAL,
                REVNET_PROJECT,
                COOP,
                COOP
            );
            LeaderboardMigrator migrator = new LeaderboardMigrator(COOP, IMigrationLeaderboardFactory(address(factory)));
            vm.startPrank(COOP);
            factory.setMigrator(address(migrator));
            migrator.setSourceFactory(address(legacyFactory), true);
            migrator.setOperator(operator, true);
            vm.stopPrank();

            address[] memory boards = legacyFactory.getLeaderboards(0, legacyFactory.leaderboardCount());
            for (uint256 i = 0; i < boards.length; i++) {
                LeaderboardV13 legacy = LeaderboardV13(boards[i]);
                address[] memory legacyMarkees = legacy.getMarkees(0, legacy.markeeCount());

                vm.prank(operator);
                uint256 gasBefore = gasleft();
                Leaderboard successor = Leaderboard(migrator.migrate(boards[i]));
                maxGas = _max(maxGas, gasBefore - gasleft());

                assertEq(successor.admin(), legacy.admin(), "admin not handed over");
                assertEq(successor.beneficiaryAddress(), legacy.beneficiaryAddress());
                assertEq(successor.minimumPrice(), legacy.minimumPrice());
                assertEq(successor.markeeCount(), _nonEmpty(legacyMarkees) + 1, "markee count mismatch");
                assertEq(successor.totalLeaderboardFunds(), legacy.totalLeaderboardFunds(), "carried totals mismatch");
                migrated++;
            }
        }
        emit log_named_uint("lump-sum boards migrated", migrated);
        emit log_named_uint("max gas per lump-sum migration", maxGas);
    }
}
