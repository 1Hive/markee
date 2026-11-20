// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PlatformBoardRegistrar} from "../../contracts/revenue/PlatformBoardRegistrar.sol";

/// @notice Deploys a new direct-Base-beneficiary registrar. Does not enable an operator or migrate a board.
contract DeployPlatformBoardRegistrar is Script {
    function run() external {
        require(block.chainid == 8453, "Base only");
        address owner = vm.envAddress("REVENUE_OWNER");
        address saleFactory = vm.envAddress("REVENUE_SALE_FACTORY");
        address rentFactory = vm.envAddress("REVENUE_RENT_FACTORY");
        require(owner != address(0) && saleFactory.code.length > 0 && rentFactory.code.length > 0, "invalid inputs");
        vm.startBroadcast();
        PlatformBoardRegistrar implementation = new PlatformBoardRegistrar();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(PlatformBoardRegistrar.initialize, (owner, saleFactory, rentFactory))
        );
        vm.stopBroadcast();
        console2.log("Owner", owner);
        console2.log("Registrar implementation", address(implementation));
        console2.log("Registrar proxy (no operator enabled)", address(proxy));
    }
}
