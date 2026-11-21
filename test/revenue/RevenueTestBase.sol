// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CommunityRevenueRouter} from "../../contracts/revenue/CommunityRevenueRouter.sol";
import {CommunityRevenueReceiver} from "../../contracts/revenue/CommunityRevenueReceiver.sol";
import {CommunityRevenueVault} from "../../contracts/revenue/CommunityRevenueVault.sol";
import {GardensCommunityAdapter} from "../../contracts/revenue/platforms/GardensCommunityAdapter.sol";
import {RevenueEnvelope, RevenueIdentity} from "../../contracts/revenue/RevenueTypes.sol";

contract RevenueToken is ERC20 {
    constructor() ERC20("Revenue ETH", "ETH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public {
        _burn(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok);
    }

    function downgradeToETH(uint256 amount) external {
        withdraw(amount);
    }
}

contract RevenueCommunity {
    address public councilSafe;

    constructor(address safe) {
        councilSafe = safe;
    }

    function setCouncilSafe(address safe) external {
        councilSafe = safe;
    }
}

contract RejectingCouncil {
    receive() external payable {
        revert("unavailable Safe");
    }
}

contract GasBurningAdapter {
    function transferToCommunity(bytes32, bytes32, address, uint256) external payable {
        assembly { for {} 1 {} {} }
    }
}

contract NoopAdapter {
    function transferToCommunity(bytes32, bytes32, address, uint256) external payable {}
}

abstract contract RevenueTestBase is Test {
    bytes32 internal constant GARDENS = keccak256("gardens");
    RevenueToken internal ethx;
    RevenueToken internal weth;
    RevenueCommunity internal community;
    CommunityRevenueRouter internal router;
    CommunityRevenueReceiver internal receiver;
    CommunityRevenueVault internal vault;
    GardensCommunityAdapter internal gardens;
    address internal safe = address(0xCAFE);
    bytes32 internal communityId;
    bytes32 internal key;

    function setUp() public virtual {
        vm.chainId(8453);
        vm.deal(address(this), 1_000 ether);
        ethx = new RevenueToken();
        weth = new RevenueToken();
        vm.deal(address(ethx), 1_000 ether);
        vm.deal(address(weth), 1_000 ether);
        community = new RevenueCommunity(safe);
        communityId = bytes32(uint256(uint160(address(community))));
        receiver = CommunityRevenueReceiver(
            payable(address(
                    new ERC1967Proxy(
                        address(new CommunityRevenueReceiver()),
                        abi.encodeCall(CommunityRevenueReceiver.initialize, (address(this), true))
                    )
                ))
        );
        router = CommunityRevenueRouter(
            payable(address(
                    new ERC1967Proxy(
                        address(new CommunityRevenueRouter()),
                        abi.encodeCall(
                            CommunityRevenueRouter.initialize,
                            (address(this), address(new CommunityRevenueVault()), address(ethx), address(weth))
                        )
                    )
                ))
        );
        gardens = GardensCommunityAdapter(
            address(
                new ERC1967Proxy(
                    address(new GardensCommunityAdapter()),
                    abi.encodeCall(GardensCommunityAdapter.initialize, (address(this), address(receiver)))
                )
            )
        );
        receiver.setPlatformAdapter(GARDENS, address(gardens));
        receiver.setLocalRouter(address(router), true);
        receiver.setExecutor(address(this), true);
        receiver.setAsset(address(weth), true, true);
        router.setRegistrar(GARDENS, address(this));
        router.setKeeper(address(this), true);
        router.setReceiver(block.chainid, address(receiver));
        key = RevenueIdentity.key(GARDENS, block.chainid, communityId);
        vault = CommunityRevenueVault(payable(router.registerCommunity(GARDENS, block.chainid, communityId)));
    }

    receive() external payable {}

    function envelope(uint256 nonce) internal view returns (RevenueEnvelope memory) {
        return
            RevenueEnvelope(
                bytes32(nonce), RevenueIdentity.key(GARDENS, block.chainid, communityId), GARDENS, communityId
            );
    }

    function receiptId(uint256 nonce) internal view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(receiver), nonce));
    }

    function status(bytes32 id) internal view returns (CommunityRevenueReceiver.Status value) {
        (,,, value) = receiver.payouts(id);
    }

    function sweep(uint256 amount, uint256 fee) internal {
        router.sweep(key, router.nextPayoutId(key), amount, fee, bytes32(0), amount - fee, "");
    }
}
