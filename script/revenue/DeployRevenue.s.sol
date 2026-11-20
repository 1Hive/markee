// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommunityRevenueRouter} from "../../contracts/revenue/CommunityRevenueRouter.sol";
import {CommunityRevenueVault} from "../../contracts/revenue/CommunityRevenueVault.sol";
import {CommunityRevenueReceiver} from "../../contracts/revenue/CommunityRevenueReceiver.sol";
import {GardensCommunityAdapter} from "../../contracts/revenue/platforms/GardensCommunityAdapter.sol";
import {RevnetCommunityAdapter} from "../../contracts/revenue/platforms/RevnetCommunityAdapter.sol";
import {CommunityBoardRegistrar} from "../../contracts/revenue/CommunityBoardRegistrar.sol";

/// @notice New deployments only. No existing Gardens/Markee proxy, leaderboard,
/// vault, admin or beneficiary is touched. Deployment does not enable a route.
contract DeployRevenue is Script {
    function inputs() internal view returns (address owner) {
        require(block.chainid == vm.envUint("REVENUE_CHAIN_ID"), "unexpected chain");
        owner = vm.envAddress("REVENUE_OWNER");
        require(owner != address(0), "owner required");
    }

    function deploySource() external {
        address owner = inputs();
        require(block.chainid == 8453, "source is Base");
        address ethx = vm.envAddress("REVENUE_ETHX");
        address weth = vm.envAddress("REVENUE_WETH");
        require(ethx.code.length != 0 && weth.code.length != 0, "missing tokens");
        address saleFactory = vm.envAddress("REVENUE_SALE_FACTORY");
        address rentFactory = vm.envAddress("REVENUE_RENT_FACTORY");
        require(saleFactory.code.length != 0 && rentFactory.code.length != 0, "missing factories");
        vm.startBroadcast();
        CommunityRevenueVault vault = new CommunityRevenueVault();
        CommunityRevenueRouter implementation = new CommunityRevenueRouter();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(CommunityRevenueRouter.initialize, (owner, address(vault), ethx, weth))
        );
        CommunityBoardRegistrar registrarImpl = new CommunityBoardRegistrar();
        ERC1967Proxy registrar = new ERC1967Proxy(
            address(registrarImpl),
            abi.encodeCall(CommunityBoardRegistrar.initialize, (owner, address(proxy), saleFactory, rentFactory))
        );
        vm.stopBroadcast();
        console2.log("Chain", block.chainid);
        console2.log("Owner", owner);
        console2.log("Vault implementation", address(vault));
        console2.log("Router implementation", address(implementation));
        console2.log("Router proxy (not yet configured)", address(proxy));
        console2.log("Registrar implementation", address(registrarImpl));
        console2.log("Registrar proxy (not yet configured)", address(registrar));
    }

    function deployDestination() external {
        address owner = inputs();
        bool nativeETH = vm.envBool("REVENUE_NATIVE_ETH");
        // These chains' gas currencies are NOT ETH. Their bridged ETH must stay ERC20.
        if (block.chainid == 100 || block.chainid == 137 || block.chainid == 42220) {
            require(!nativeETH, "non-ETH chain");
        }
        address directory = vm.envOr("REVENUE_JB_DIRECTORY", address(0));
        require(directory == address(0) || (nativeETH && directory.code.length > 0), "invalid Revnet directory");
        vm.startBroadcast();
        CommunityRevenueReceiver receiverImpl = new CommunityRevenueReceiver();
        ERC1967Proxy receiver = new ERC1967Proxy(
            address(receiverImpl), abi.encodeCall(CommunityRevenueReceiver.initialize, (owner, nativeETH))
        );
        GardensCommunityAdapter gardensImpl = new GardensCommunityAdapter();
        ERC1967Proxy gardens = new ERC1967Proxy(
            address(gardensImpl), abi.encodeCall(GardensCommunityAdapter.initialize, (owner, address(receiver)))
        );
        if (directory != address(0)) {
            RevnetCommunityAdapter revnetImpl = new RevnetCommunityAdapter();
            ERC1967Proxy revnet = new ERC1967Proxy(
                address(revnetImpl),
                abi.encodeCall(RevnetCommunityAdapter.initialize, (owner, address(receiver), directory))
            );
            console2.log("Revnet implementation", address(revnetImpl));
            console2.log("Revnet proxy", address(revnet));
        }
        vm.stopBroadcast();
        console2.log("Chain", block.chainid);
        console2.log("Owner", owner);
        console2.log("Receiver implementation", address(receiverImpl));
        console2.log("Receiver proxy (not yet configured)", address(receiver));
        console2.log("Gardens implementation", address(gardensImpl));
        console2.log("Gardens proxy", address(gardens));
    }
}
