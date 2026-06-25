// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import { StreamingLeaderboardFactory } from "../contracts/v1.3/streaming/StreamingLeaderboardFactory.sol";

/// @notice Deploys the StreamingLeaderboardFactory (its constructor deploys the StreamingLeaderboard +
///         Markee implementations). Base addresses are the same ones the fork tests use.
///
/// Fork / local:
///   anvil --fork-url $BASE_RPC_URL --chain-id 8453
///   forge script script/DeployStreamingFactory.s.sol --rpc-url http://localhost:8545 \
///     --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
///
/// Mainnet:
///   forge script script/DeployStreamingFactory.s.sol --rpc-url base --account revnet-admin --broadcast
///
/// NOTE: the factory cannot create working leaderboards until Superfluid governance authorizes it via
/// gov.setAppRegistrationKey(HOST, factory, "k1", farFutureTs). On a fork this is done by impersonating
/// the gov owner (see scripts/streaming-fork-setup.sh); on mainnet it is a Superfluid governance request.
contract DeployStreamingFactory is Script {
    address constant HOST = 0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74;
    address constant ETHX = 0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93;
    address constant JB_TERMINAL = 0x2dB6d704058E552DeFE415753465df8dF0361846;
    uint256 constant JB_PROJECT_ID = 152;
    address constant COOP = 0xAf4401E765dFf079aB6021BBb8d46E53E27613DB;

    function run() external returns (StreamingLeaderboardFactory factory) {
        string memory platformName = vm.envOr("PLATFORM_NAME", string("Streaming"));
        string memory platformId = vm.envOr("PLATFORM_ID", string("streaming"));

        vm.startBroadcast();
        factory = new StreamingLeaderboardFactory(
            platformName,
            platformId,
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
