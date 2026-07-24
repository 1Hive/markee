// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import { StreamingLeaderboardFactory } from "../contracts/v1.3/streaming/StreamingLeaderboardFactory.sol";

/// @notice Deploys the StreamingLeaderboardFactory (its constructor deploys the StreamingLeaderboard +
///         Markee implementations).
///
/// A single factory serves every platform: createLeaderboard takes a platformName/platformId per board.
/// Fees are uniform across platforms and stay factory-level.
///
///   forge script script/DeployStreamingFactory.s.sol --rpc-url base --account revnet-admin --broadcast
///
/// NOTE: the factory cannot create working leaderboards until Superfluid governance authorizes it via
/// gov.setAppRegistrationKey(HOST, factory, "k1", farFutureTs). registerApp permissions on the calling
/// address, so this one authorization covers every platform's boards.
contract DeployStreamingFactory is Script {
    address constant HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    address constant ETHX = 0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93;
    address constant JB_TERMINAL = 0x130f5Dd2bD8805443Cf41755253D778a75a67f53;
    uint256 constant JB_PROJECT_ID = 7;
    address constant COOP = 0xAf4401E765dFf079aB6021BBb8d46E53E27613DB;

    function run() external returns (StreamingLeaderboardFactory factory) {
        vm.startBroadcast();
        factory = new StreamingLeaderboardFactory(
            ISuperfluid(HOST),
            ISuperToken(ETHX),
            JB_TERMINAL,
            JB_PROJECT_ID,
            COOP, // platformFeeReceiver
            COOP // factoryAdmin
        );
        vm.stopBroadcast();

        console2.log("StreamingLeaderboardFactory:", address(factory));
        console2.log("leaderboardImplementation:  ", factory.leaderboardImplementation());
        console2.log("markeeImplementation:       ", factory.markeeImplementation());
    }
}
