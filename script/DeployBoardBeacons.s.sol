// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperApp.sol";

import { StreamingLeaderboard } from "../contracts/v1.3/streaming/StreamingLeaderboard.sol";
import { Leaderboard } from "../contracts/v1.4/Leaderboard.sol";
import { Leaderboard as LeaderboardV13 } from "../contracts/v1.3/Leaderboard.sol";
import { Markee } from "../contracts/v1.3/Markee.sol";
import { LeaderboardFactory as LeaderboardFactoryV13 } from "../contracts/v1.3/LeaderboardFactory.sol";
import { LeaderboardFactory as LeaderboardFactoryV14 } from "../contracts/v1.4/LeaderboardFactory.sol";
import { StreamingBoardBeacon } from "../contracts/upgrade/StreamingBoardBeacon.sol";
import { LeaderboardBeacon } from "../contracts/upgrade/LeaderboardBeacon.sol";
import { BeaconForwarder, IBoardRouter } from "../contracts/upgrade/BeaconForwarder.sol";
import { StreamingBoardMigrator, IStreamingFactoryRegistry } from "../contracts/upgrade/StreamingBoardMigrator.sol";
import { LeaderboardMigrator, IMigrationLeaderboardFactory } from "../contracts/upgrade/LeaderboardMigrator.sol";
import { SunsetTerminal } from "../contracts/upgrade/SunsetTerminal.sol";

/// @notice Deploys the beacon-backed board infrastructure for both families.
///
///   GUARDIAN=<pause key> OPERATOR=<migration key> \
///   forge script script/DeployBoardBeacons.s.sol --rpc-url base --account revnet-admin --broadcast
///
/// The deployer temporarily administers the v1.4 factories and the migrators to wire them, then hands
/// factories to the Coop directly and starts two-step ownership transfers of the migrators and the v1.4
/// factories. The Coop Safe then runs, in one batch:
///   1. StreamingLeaderboardFactory(0x37f4…7039).setImplementations(streamingForwarder, markeeImplementation)
///   2. acceptOwnership() on the streaming migrator and each lump-sum migrator
///   3. acceptFactoryAdmin() on each v1.4 factory
/// After that the operator key can run migrate(board) per legacy board, and once a lump-sum factory is
/// fully migrated the Coop points its revNetTerminal at that factory's SunsetTerminal.
contract DeployBoardBeacons is Script {
    address constant HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    address constant ETHX = 0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93;
    address constant JB_TERMINAL = 0x130f5Dd2bD8805443Cf41755253D778a75a67f53;
    uint256 constant JB_PROJECT_ID = 7;
    address constant COOP = 0xAf4401E765dFf079aB6021BBb8d46E53E27613DB;
    uint256 constant UPGRADE_DELAY = 2 days;

    address constant STREAMING_FACTORY = 0x37f420fdE5c98e611EB7cb9b74ef579D84697039;
    address constant LEGACY_STREAMING_IMPLEMENTATION = 0xd2038c21efCf5245547a66f85229Cd654C7664B7;
    address constant FACTORY_SUPERFLUID = 0xC497187AAa35C26b0008B43C10A6F6300b7eBcad;
    address constant FACTORY_OPEN_INTERNET = 0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c;
    address constant FACTORY_GITHUB = 0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2;
    address constant FACTORY_FOR_SALE = 0x861D9897eC47421aAFB6321Ee219E88ab485121f;

    function run() external {
        address guardian = vm.envAddress("GUARDIAN");
        address operator = vm.envAddress("OPERATOR");

        vm.startBroadcast();
        _deployStreaming(guardian, operator);
        _deployLumpSum(guardian, operator);
        vm.stopBroadcast();
    }

    function _deployStreaming(address guardian, address operator) internal {
        StreamingBoardMigrator migrator =
            new StreamingBoardMigrator(msg.sender, IStreamingFactoryRegistry(STREAMING_FACTORY), 0, 0);
        address implementation =
            address(new StreamingLeaderboard(ISuperfluid(HOST), ISuperToken(ETHX), address(migrator)));
        StreamingBoardBeacon beacon = new StreamingBoardBeacon(
            ISuperfluid(HOST), ISuperToken(ETHX), implementation, COOP, guardian, UPGRADE_DELAY, _streamingPausable()
        );
        BeaconForwarder forwarder = new BeaconForwarder(IBoardRouter(address(beacon)), true);
        migrator.setSourceFactory(STREAMING_FACTORY, true);
        migrator.setSourceImplementation(LEGACY_STREAMING_IMPLEMENTATION, true);
        migrator.setOperator(operator, true);
        migrator.transferOwnership(COOP);

        console2.log("streaming implementation:", implementation);
        console2.log("streaming beacon:        ", address(beacon));
        console2.log("streaming forwarder:     ", address(forwarder));
        console2.log("streaming migrator:      ", address(migrator));
    }

    function _deployLumpSum(address guardian, address operator) internal {
        address implementation = address(new Leaderboard());
        address markeeImplementation = address(new Markee());
        LeaderboardBeacon beacon =
            new LeaderboardBeacon(implementation, COOP, guardian, UPGRADE_DELAY, _lumpSumPausable());
        address forwarder = address(new BeaconForwarder(IBoardRouter(address(beacon)), false));

        console2.log("lump-sum implementation: ", implementation);
        console2.log("lump-sum markee impl:    ", markeeImplementation);
        console2.log("lump-sum beacon:         ", address(beacon));
        console2.log("lump-sum forwarder:      ", forwarder);

        address[4] memory legacyFactories =
            [FACTORY_SUPERFLUID, FACTORY_OPEN_INTERNET, FACTORY_GITHUB, FACTORY_FOR_SALE];
        for (uint256 i = 0; i < legacyFactories.length; i++) {
            LeaderboardFactoryV13 legacy = LeaderboardFactoryV13(legacyFactories[i]);
            LeaderboardFactoryV14 factory = new LeaderboardFactoryV14(
                legacy.platformName(),
                legacy.platformId(),
                forwarder,
                markeeImplementation,
                JB_TERMINAL,
                JB_PROJECT_ID,
                COOP,
                msg.sender
            );
            LeaderboardMigrator migrator =
                new LeaderboardMigrator(msg.sender, IMigrationLeaderboardFactory(address(factory)));
            SunsetTerminal sunset = new SunsetTerminal(address(migrator));

            factory.setMigrator(address(migrator));
            factory.setFactoryAdmin(COOP);
            migrator.setSourceFactory(address(legacy), true);
            migrator.setOperator(operator, true);
            migrator.transferOwnership(COOP);

            console2.log(legacy.platformId());
            console2.log("  v1.4 factory:          ", address(factory));
            console2.log("  migrator:              ", address(migrator));
            console2.log("  sunset terminal:       ", address(sunset));
        }
    }

    function _streamingPausable() internal pure returns (bytes4[] memory s) {
        s = new bytes4[](6);
        s[0] = StreamingLeaderboard.createMarkee.selector;
        s[1] = StreamingLeaderboard.depositBuffer.selector;
        s[2] = StreamingLeaderboard.claimTop.selector;
        s[3] = StreamingLeaderboard.settle.selector;
        s[4] = ISuperApp.afterAgreementCreated.selector;
        s[5] = ISuperApp.afterAgreementUpdated.selector;
    }

    function _lumpSumPausable() internal pure returns (bytes4[] memory s) {
        s = new bytes4[](2);
        s[0] = Leaderboard.createMarkee.selector;
        s[1] = Leaderboard.addFunds.selector;
    }
}
