// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueTestBase, CommunityRevenueReceiver} from "./RevenueTestBase.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RevenueUpgradeable} from "../../contracts/revenue/RevenueUpgradeable.sol";

contract TaxedRevenueToken is ERC20 {
    constructor() ERC20("Unsupported", "BAD") {
        _mint(msg.sender, 2 ether);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > 1) {
            super._update(from, address(0), 1);
            value--;
        }
        super._update(from, to, value);
    }
}

contract ReentrantCouncil {
    CommunityRevenueReceiver receiver;
    bytes32 receipt;
    bool public entered;

    constructor(CommunityRevenueReceiver r, bytes32 id) {
        receiver = r;
        receipt = id;
    }

    receive() external payable {
        (bool ok,) = address(receiver).call(abi.encodeCall(receiver.retryPayout, (receipt)));
        entered = ok;
    }
}

contract ReceiverSafetyTest is RevenueTestBase {
    function testFeeOnTransferTokenRejectedWithoutReceiptOrEscrow() public {
        TaxedRevenueToken taxed = new TaxedRevenueToken();
        receiver.setAsset(address(taxed), true, false);
        taxed.approve(address(receiver), 1 ether);
        vm.expectRevert(RevenueUpgradeable.InvalidAmount.selector);
        receiver.receiveToken(envelope(1), address(taxed), 1 ether);
        assertEq(receiver.receiptNonce(), 0);
        assertEq(taxed.balanceOf(address(receiver)), 0);
        assertEq(taxed.balanceOf(address(this)), 2 ether);
    }

    function testCouncilCannotReenterRetryDuringPayout() public {
        ReentrantCouncil council = new ReentrantCouncil(receiver, receiptId(0));
        community.setCouncilSafe(address(council));
        bytes32 id = receiver.receiveNative{value: 1 ether}(envelope(1));
        assertFalse(council.entered());
        assertEq(address(council).balance, 1 ether);
        assertEq(uint256(status(id)), 2);
        assertEq(receiver.escrowed(address(0)), 0);
    }

    function testTokenEscrowCanRecoverWithoutApprovingAdapter() public {
        receiver.setPlatformAdapter(GARDENS, address(0));
        receiver.setAsset(address(weth), true, false);
        weth.mint(address(this), 1 ether);
        weth.approve(address(receiver), 1 ether);
        bytes32 id = receiver.receiveToken(envelope(1), address(weth), 1 ether);
        receiver.recoverPayout(id, payable(safe));
        assertEq(weth.balanceOf(safe), 1 ether);
        assertEq(weth.allowance(address(receiver), address(gardens)), 0);
        assertEq(receiver.escrowed(address(weth)), 0);
    }
}
