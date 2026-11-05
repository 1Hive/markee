// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Script, console2 } from "forge-std/Script.sol";
import { MarkeeJuiceboxForwarder } from "../contracts/integrations/juicebox/MarkeeJuiceboxForwarder.sol";

/// @notice Deploys a MarkeeJuiceboxForwarder for one Markee For Rent sign and one Juicebox v6 project.
///
/// Env:
///   LEADERBOARD    the For Rent sign's StreamingLeaderboard address (required)
///   JB_PROJECT_ID  the Juicebox project to pay (required)
///   JB_MEMO        memo on each Juicebox payment (default "Markee For Rent")
///   JB_DIRECTORY   JBDirectory (default: Juicebox v6 on Base)
///
/// Run:
///   LEADERBOARD=0x... JB_PROJECT_ID=123 forge script script/DeployMarkeeJuiceboxForwarder.s.sol \
///     --rpc-url $BASE_RPC_URL --broadcast --verify
///
/// Afterwards the sign's admin calls `setBeneficiaryAddress(<forwarder>)` on the leaderboard (see the
/// README for the procedure when the sign already has backers).
contract DeployMarkeeJuiceboxForwarder is Script {
    address constant BASE_JB_DIRECTORY = 0x5AfF29060E023e6FB87BE5596652B33c65Af535B;

    function run() external returns (MarkeeJuiceboxForwarder forwarder) {
        address leaderboard = vm.envAddress("LEADERBOARD");
        uint256 projectId = vm.envUint("JB_PROJECT_ID");
        string memory memo = vm.envOr("JB_MEMO", string("Markee For Rent"));
        address directory = vm.envOr("JB_DIRECTORY", BASE_JB_DIRECTORY);

        vm.startBroadcast();
        forwarder = new MarkeeJuiceboxForwarder(directory, leaderboard, projectId, memo);
        vm.stopBroadcast();

        console2.log("MarkeeJuiceboxForwarder:", address(forwarder));
        console2.log("  leaderboard:", leaderboard);
        console2.log("  JB project:", projectId);
    }
}
