// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueTestBase, ERC1967Proxy, RevenueEnvelope, RevenueIdentity} from "./RevenueTestBase.sol";
import {RevnetCommunityAdapter} from "../../contracts/revenue/platforms/RevnetCommunityAdapter.sol";

contract RevenueDirectory {
    address public terminal;
    bool public registered = true;

    function setTerminal(address next) external {
        terminal = next;
    }

    function setRegistered(bool value) external {
        registered = value;
    }

    function primaryTerminalOf(uint256, address) external view returns (address) {
        return terminal;
    }

    function isTerminalOf(uint256, address candidate) external view returns (bool) {
        return registered && candidate == terminal;
    }
}

contract RevenueTerminal {
    uint256 public totalAdded;
    uint256 public project;

    function addToBalanceOf(
        uint256 projectId,
        address token,
        uint256 amount,
        bool returnFees,
        string calldata memo,
        bytes calldata metadata
    ) external payable {
        require(token == address(0xEEEe) && msg.value == amount && !returnFees);
        require(keccak256(bytes(memo)) == keccak256("Markee community revenue") && metadata.length == 0);
        totalAdded += amount;
        project = projectId;
    }
    // No receive()/fallback()/pay(): a raw transfer or token-minting pay call fails.
}

contract RevnetAdapterTest is RevenueTestBase {
    bytes32 constant REVNET = keccak256("revnet");
    RevenueDirectory directory;
    RevenueTerminal terminal;
    RevnetCommunityAdapter revnet;

    function setUp() public override {
        super.setUp();
        directory = new RevenueDirectory();
        terminal = new RevenueTerminal();
        directory.setTerminal(address(terminal));
        revnet = RevnetCommunityAdapter(
            address(
                new ERC1967Proxy(
                    address(new RevnetCommunityAdapter()),
                    abi.encodeCall(
                        RevnetCommunityAdapter.initialize, (address(this), address(receiver), address(directory))
                    )
                )
            )
        );
        receiver.setPlatformAdapter(REVNET, address(revnet));
    }

    function revnetEnvelope(uint256 nonce) internal view returns (RevenueEnvelope memory) {
        return RevenueEnvelope(
            bytes32(nonce), RevenueIdentity.key(REVNET, block.chainid, bytes32(uint256(7))), REVNET, bytes32(uint256(7))
        );
    }

    function testAddsToBalanceAndResolvesTerminalAtDeliveryTime() public {
        receiver.receiveNative{value: 1 ether}(revnetEnvelope(1));
        assertEq(terminal.totalAdded(), 1 ether);
        assertEq(terminal.project(), 7);
        RevenueTerminal next = new RevenueTerminal();
        directory.setTerminal(address(next));
        receiver.receiveNative{value: 2 ether}(revnetEnvelope(2));
        assertEq(next.totalAdded(), 2 ether);
        assertEq(terminal.totalAdded(), 1 ether);
    }

    function testTerminalFailureEscrowsAndRetryUsesUpdatedDirectory() public {
        directory.setRegistered(false);
        bytes32 id = receiver.receiveNative{value: 1 ether}(revnetEnvelope(1));
        assertEq(uint256(status(id)), 1);
        assertEq(terminal.totalAdded(), 0);
        directory.setRegistered(true);
        receiver.retryPayout(id);
        assertEq(terminal.totalAdded(), 1 ether);
    }

    function testRevnetRejectsNonEthAssetWithoutLosingFunds() public {
        receiver.setAsset(address(weth), true, false);
        weth.mint(address(this), 1 ether);
        weth.approve(address(receiver), 1 ether);
        bytes32 id = receiver.receiveToken(revnetEnvelope(1), address(weth), 1 ether);
        assertEq(uint256(status(id)), 1);
        assertEq(weth.balanceOf(address(receiver)), 1 ether);
    }
}
