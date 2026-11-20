// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommunityRevenueReceiver} from "../../contracts/revenue/CommunityRevenueReceiver.sol";
import {GardensCommunityAdapter, IGardensCouncil} from "../../contracts/revenue/platforms/GardensCommunityAdapter.sol";
import {
    RevnetCommunityAdapter,
    IRevenueJBDirectory
} from "../../contracts/revenue/platforms/RevnetCommunityAdapter.sol";
import {RevenueEnvelope, RevenueIdentity} from "../../contracts/revenue/RevenueTypes.sol";

interface IForkJBTerminal {
    function DIRECTORY() external view returns (address);
    function STORE() external view returns (address);
}

interface IForkJBStore {
    function balanceOf(address terminal, uint256 projectId, address token) external view returns (uint256);
}

/// @notice Opt-in RPC tests only. These deploy and transfer exclusively inside
/// local forks; no signing key or live transaction is involved.
contract PilotForkTest is Test {
    function testForkGardensPilotPaysLiveCouncilInWETH() public {
        string memory rpc = vm.envOr("REVENUE_GNOSIS_FORK_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc, vm.envOr("REVENUE_GNOSIS_FORK_BLOCK", uint256(48791917)));
        address community = 0xE2396fe2169ca026962971d3B2E373Ba925B6257;
        address weth = 0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1;
        address council = IGardensCouncil(community).councilSafe();
        assertTrue(council.code.length > 0);
        CommunityRevenueReceiver receiver = CommunityRevenueReceiver(
            payable(address(
                    new ERC1967Proxy(
                        address(new CommunityRevenueReceiver()),
                        abi.encodeCall(CommunityRevenueReceiver.initialize, (address(this), false))
                    )
                ))
        );
        GardensCommunityAdapter adapter = GardensCommunityAdapter(
            address(
                new ERC1967Proxy(
                    address(new GardensCommunityAdapter()),
                    abi.encodeCall(GardensCommunityAdapter.initialize, (address(this), address(receiver)))
                )
            )
        );
        bytes32 platform = keccak256("gardens");
        bytes32 communityId = bytes32(uint256(uint160(community)));
        receiver.setPlatformAdapter(platform, address(adapter));
        receiver.setExecutor(address(this), true);
        receiver.setAsset(weth, true, false);
        uint256 amount = 0.00001 ether;
        deal(weth, address(this), amount);
        IERC20(weth).approve(address(receiver), amount);
        uint256 beforeToken = IERC20(weth).balanceOf(council);
        uint256 beforeNative = council.balance;
        bytes32 id = receiver.receiveToken(
            RevenueEnvelope(
                bytes32(uint256(1)), RevenueIdentity.key(platform, block.chainid, communityId), platform, communityId
            ),
            weth,
            amount
        );
        (,,, CommunityRevenueReceiver.Status state) = receiver.payouts(id);
        assertEq(uint256(state), uint256(CommunityRevenueReceiver.Status.Delivered));
        assertEq(IERC20(weth).balanceOf(council), beforeToken + amount);
        assertEq(council.balance, beforeNative);
    }

    function testForkRevnetCreditsTerminalBalanceNotPay() public {
        string memory rpc = vm.envOr("REVENUE_BASE_FORK_RPC", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc, vm.envOr("REVENUE_BASE_FORK_BLOCK", uint256(52696559)));
        address seedTerminal = 0x130f5Dd2bD8805443Cf41755253D778a75a67f53;
        address directory = IForkJBTerminal(seedTerminal).DIRECTORY();
        uint256 projectId = 7;
        address token = address(0xEEEe);
        address terminal = IRevenueJBDirectory(directory).primaryTerminalOf(projectId, token);
        address store = IForkJBTerminal(terminal).STORE();
        CommunityRevenueReceiver receiver = CommunityRevenueReceiver(
            payable(address(
                    new ERC1967Proxy(
                        address(new CommunityRevenueReceiver()),
                        abi.encodeCall(CommunityRevenueReceiver.initialize, (address(this), true))
                    )
                ))
        );
        RevnetCommunityAdapter adapter = RevnetCommunityAdapter(
            address(
                new ERC1967Proxy(
                    address(new RevnetCommunityAdapter()),
                    abi.encodeCall(RevnetCommunityAdapter.initialize, (address(this), address(receiver), directory))
                )
            )
        );
        bytes32 platform = keccak256("revnet");
        bytes32 communityId = bytes32(projectId);
        receiver.setPlatformAdapter(platform, address(adapter));
        receiver.setExecutor(address(this), true);
        uint256 amount = 0.00001 ether;
        vm.deal(address(this), amount);
        uint256 beforeBalance = IForkJBStore(store).balanceOf(terminal, projectId, token);
        bytes32 id = receiver.receiveNative{value: amount}(
            RevenueEnvelope(
                bytes32(uint256(1)), RevenueIdentity.key(platform, block.chainid, communityId), platform, communityId
            )
        );
        (,,, CommunityRevenueReceiver.Status state) = receiver.payouts(id);
        assertEq(uint256(state), uint256(CommunityRevenueReceiver.Status.Delivered));
        assertEq(IForkJBStore(store).balanceOf(terminal, projectId, token), beforeBalance + amount);
    }
}
