// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueTestBase, RevenueEnvelope, RevenueIdentity} from "./RevenueTestBase.sol";
import {RevenueBridgeRequest} from "../../contracts/revenue/RevenueTypes.sol";
import {AcrossRevenueBridgeAdapter} from "../../contracts/revenue/bridges/AcrossRevenueBridgeAdapter.sol";
import {SquidRevenueBridgeAdapter} from "../../contracts/revenue/bridges/SquidRevenueBridgeAdapter.sol";
import {LiFiRevenueBridgeAdapter as LiFi} from "../../contracts/revenue/bridges/LiFiRevenueBridgeAdapter.sol";
import {RevenueBridgeBase} from "../../contracts/revenue/bridges/RevenueBridgeBase.sol";

contract RevenueSpoke {
    bytes public message;
    address public depositor;
    address public recipient;
    address public inputToken;
    address public outputToken;
    uint256 public outputAmount;
    uint256 public destinationChain;

    function depositV3Now(
        address depositor_,
        address recipient_,
        address inputToken_,
        address outputToken_,
        uint256 inputAmount_,
        uint256 outputAmount_,
        uint256 chain_,
        address relayer_,
        uint32 deadline_,
        uint32 exclusivity_,
        bytes calldata message_
    ) external payable {
        require(msg.value == inputAmount_ && relayer_ == address(0) && exclusivity_ == 0 && deadline_ > 0);
        depositor = depositor_;
        recipient = recipient_;
        inputToken = inputToken_;
        outputToken = outputToken_;
        outputAmount = outputAmount_;
        destinationChain = chain_;
        message = message_;
    }
}

contract RevenueProvider {
    bool public fail;
    uint256 public refund;

    function configure(bool fail_, uint256 refund_) external {
        fail = fail_;
        refund = refund_;
    }

    fallback() external payable {
        require(!fail);
        if (refund != 0) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            require(ok);
        }
    }
}

contract BridgeAdaptersTest is RevenueTestBase {
    RevenueSpoke spoke;
    RevenueProvider provider;
    AcrossRevenueBridgeAdapter across;
    SquidRevenueBridgeAdapter squid;
    LiFi lifi;
    RevenueBridgeRequest request;
    uint256 signerKey = 0xA11CE;

    function setUp() public override {
        super.setUp();
        spoke = new RevenueSpoke();
        provider = new RevenueProvider();
        across = new AcrossRevenueBridgeAdapter(address(this), address(this), address(spoke), address(weth));
        across.setDestinationToken(100, address(weth));
        squid = new SquidRevenueBridgeAdapter(address(this), address(this), address(provider));
        squid.setQuoteSigner(vm.addr(signerKey));
        lifi = new LiFi(address(this), address(this), address(provider));
        lifi.setSourceRoute(address(provider), safe, 13, "markee");
        lifi.setDestination(
            100,
            LiFi.Destination(30145, bytes32(uint256(uint160(address(provider)))), address(weth), keccak256(hex"0003"))
        );
        request = RevenueBridgeRequest(
            100,
            address(receiver),
            address(vault),
            1 ether,
            0.99 ether,
            RevenueEnvelope(bytes32(uint256(1)), RevenueIdentity.key(GARDENS, 100, communityId), GARDENS, communityId)
        );
    }

    function testAcrossPinsIdentityRecipientAssetAndRefundsExcess() public {
        across.bridgeETH{value: 1.1 ether}(
            request, abi.encode(AcrossRevenueBridgeAdapter.Quote(0.995 ether, uint32(block.timestamp + 1 hours)))
        );
        assertEq(spoke.depositor(), address(vault));
        assertEq(spoke.recipient(), address(receiver));
        assertEq(spoke.inputToken(), address(weth));
        assertEq(spoke.outputToken(), address(weth));
        assertEq(spoke.destinationChain(), 100);
        assertEq(spoke.message(), abi.encode(request.envelope));
        assertEq(address(vault).balance, 0.1 ether);
    }

    function testAcrossRejectsExpiredQuoteBadIdentityAndLowOutput() public {
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        across.bridgeETH{value: 1 ether}(
            request, abi.encode(AcrossRevenueBridgeAdapter.Quote(0.98 ether, uint32(block.timestamp + 1 hours)))
        );
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        across.bridgeETH{value: 1 ether}(
            request, abi.encode(AcrossRevenueBridgeAdapter.Quote(0.99 ether, uint32(block.timestamp)))
        );
        request.envelope.communityKey = bytes32(0);
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        across.bridgeETH{value: 1 ether}(
            request, abi.encode(AcrossRevenueBridgeAdapter.Quote(0.99 ether, uint32(block.timestamp + 1 hours)))
        );
    }

    function signedSquidQuote() internal view returns (SquidRevenueBridgeAdapter.Quote memory q) {
        q = SquidRevenueBridgeAdapter.Quote(
            0.995 ether, 1.02 ether, block.timestamp + 20 minutes, hex"12345678aabb", ""
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, squid.quoteDigest(request, q));
        q.signature = abi.encodePacked(r, s, v);
    }

    function testSquidBindsWholeQuoteAndPreventsReplay() public {
        SquidRevenueBridgeAdapter.Quote memory q = signedSquidQuote();
        provider.configure(false, 0.01 ether);
        squid.bridgeETH{value: 1.03 ether}(request, abi.encode(q));
        assertEq(address(provider).balance, 1.01 ether);
        assertEq(address(vault).balance, 0.02 ether);
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        squid.bridgeETH{value: 1.03 ether}(request, abi.encode(q));
    }

    function testSquidRejectsModifiedPosthookAndRecipient() public {
        SquidRevenueBridgeAdapter.Quote memory q = signedSquidQuote();
        q.routerCalldata = hex"12345678aabc";
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        squid.bridgeETH{value: 1.03 ether}(request, abi.encode(q));
        q = signedSquidQuote();
        request.destinationReceiver = safe;
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        squid.bridgeETH{value: 1.03 ether}(request, abi.encode(q));
    }

    function testSquidProviderFailureDoesNotConsumeQuote() public {
        SquidRevenueBridgeAdapter.Quote memory q = signedSquidQuote();
        bytes32 digest = squid.quoteDigest(request, q);
        provider.configure(true, 0);
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        squid.bridgeETH{value: 1.03 ether}(request, abi.encode(q));
        assertFalse(squid.usedQuotes(digest));
        provider.configure(false, 0);
        squid.bridgeETH{value: 1.03 ether}(request, abi.encode(q));
        assertTrue(squid.usedQuotes(digest));
    }

    function lifiRoute()
        internal
        view
        returns (LiFi.BridgeData memory b, LiFi.SwapData[] memory swaps, LiFi.StargateData memory s)
    {
        b = LiFi.BridgeData(
            request.envelope.payoutId,
            "stargateV2",
            "markee",
            address(0),
            address(0),
            address(lifi),
            0.998 ether,
            100,
            true,
            true
        );
        swaps = new LiFi.SwapData[](1);
        LiFi.NativeFee[] memory fees = new LiFi.NativeFee[](1);
        fees[0] = LiFi.NativeFee(safe, 0.002 ether);
        swaps[0] = LiFi.SwapData(
            address(provider),
            address(provider),
            address(0),
            address(0),
            1 ether,
            abi.encodeWithSignature("forwardNativeFees((address,uint256)[])", fees),
            true
        );
        LiFi.SwapData[] memory calls = new LiFi.SwapData[](1);
        calls[0] = LiFi.SwapData(
            address(receiver),
            address(receiver),
            address(weth),
            address(weth),
            0.995 ether,
            abi.encodeCall(receiver.receiveToken, (request.envelope, address(weth), 0.995 ether)),
            true
        );
        s = LiFi.StargateData(
            13,
            LiFi.SendParam(
                30145,
                bytes32(uint256(uint160(address(provider)))),
                0.998 ether,
                0.995 ether,
                hex"0003",
                abi.encode(request.envelope.payoutId, calls, address(receiver)),
                ""
            ),
            LiFi.MessagingFee(0.01 ether, 0),
            payable(address(lifi))
        );
    }

    function encodeLiFi(LiFi.BridgeData memory b, LiFi.SwapData[] memory swaps, LiFi.StargateData memory s)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            LiFi.Quote(
                0.995 ether,
                1.01 ether,
                block.timestamp + 10 minutes,
                abi.encodeWithSelector(bytes4(0xa6010a66), b, swaps, s)
            )
        );
    }

    function testLiFiValidatesExactRouteAndRefunds() public {
        (LiFi.BridgeData memory b, LiFi.SwapData[] memory swaps, LiFi.StargateData memory s) = lifiRoute();
        provider.configure(false, 0.003 ether);
        lifi.bridgeETH{value: 1.02 ether}(request, encodeLiFi(b, swaps, s));
        assertEq(address(provider).balance, 1.007 ether);
        assertEq(address(vault).balance, 0.013 ether);
    }

    function testFuzzLiFiRejectsRouteRedirection(uint8 mutation) public {
        mutation = uint8(bound(mutation, 0, 11));
        (LiFi.BridgeData memory b, LiFi.SwapData[] memory swaps, LiFi.StargateData memory s) = lifiRoute();
        if (mutation == 0) {
            b.receiver = safe;
        } else if (mutation == 1) {
            b.destinationChainId = 1;
        } else if (mutation == 2) {
            b.transactionId = bytes32(uint256(2));
        } else if (mutation == 3) {
            s.sendParams.dstEid++;
        } else if (mutation == 4) {
            s.sendParams.to = bytes32(uint256(5));
        } else if (mutation == 5) {
            s.refundAddress = payable(safe);
        } else if (mutation == 6) {
            s.sendParams.extraOptions = hex"0004";
        } else if (mutation == 7) {
            s.sendParams.minAmountLD--;
        } else if (mutation == 8) {
            swaps[0].callTo = safe;
        } else if (mutation == 9) {
            swaps[0].requiresDeposit = false;
        } else if (mutation == 10) {
            b.integrator = "attacker";
        } else {
            (bytes32 id, LiFi.SwapData[] memory calls,) =
                abi.decode(s.sendParams.composeMsg, (bytes32, LiFi.SwapData[], address));
            calls[0].callTo = safe;
            s.sendParams.composeMsg = abi.encode(id, calls, address(receiver));
        }
        vm.expectRevert(RevenueBridgeBase.InvalidRoute.selector);
        lifi.bridgeETH{value: 1.02 ether}(request, encodeLiFi(b, swaps, s));
    }

    function testOnlyRouterCanBridge() public {
        bytes memory data = abi.encode(AcrossRevenueBridgeAdapter.Quote(0.995 ether, uint32(block.timestamp + 1 hours)));
        vm.deal(address(0xBAD), 1 ether);
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueBridgeBase.Unauthorized.selector);
        across.bridgeETH{value: 1 ether}(request, data);
    }
}
