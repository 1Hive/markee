// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueTestBase, ERC1967Proxy, RevenueEnvelope, RevenueIdentity} from "./RevenueTestBase.sol";
import {CommunityBoardRegistrar} from "../../contracts/revenue/CommunityBoardRegistrar.sol";
import {GivethProjectAdapterPrototype} from "../../contracts/revenue/prototypes/GivethProjectAdapter.sol";
import {RevenueUpgradeable} from "../../contracts/revenue/RevenueUpgradeable.sol";

contract MockSaleFactory {
    address public lastBeneficiary;

    function createLeaderboard(address beneficiary, string calldata)
        external
        returns (address board, address seedMarkee)
    {
        lastBeneficiary = beneficiary;
        return (address(0xA11), address(0xA12));
    }
}

contract MockRentFactory {
    address public lastBeneficiary;
    address public adoptedBoard;

    function setAdoptedBoard(address board) external {
        adoptedBoard = board;
    }

    function isFactoryLeaderboard(address board) external view returns (bool) {
        return board == adoptedBoard;
    }

    function createLeaderboard(address beneficiary, string calldata, string calldata, string calldata)
        external
        returns (address board, address seedMarkee)
    {
        lastBeneficiary = beneficiary;
        return (address(0xB11), address(0xB12));
    }
}

contract MockExistingBoard {
    address public beneficiaryAddress;
    address public factory;
    address public seed;

    constructor(address factory_, address seed_) {
        factory = factory_;
        seed = seed_;
    }

    function setBeneficiary(address next) external {
        beneficiaryAddress = next;
    }

    function isMarkeeOnLeaderboard(address markee) external view returns (bool) {
        return markee == seed;
    }
}

contract MockGivethProjectData {
    address public recipient;
    bool public available = true;

    function set(address nextRecipient, bool nextAvailable) external {
        recipient = nextRecipient;
        available = nextAvailable;
    }

    function activeRecipient(uint256) external view returns (address) {
        require(available, "upstream unavailable");
        return recipient;
    }
}

contract PlatformIntegrationTest is RevenueTestBase {
    bytes32 internal constant REVNET = keccak256("revnet");
    bytes32 internal constant GIVETH = keccak256("giveth");

    function testRegistrarCreatesOneBoardWithChosenStrategyAndVault() public {
        MockSaleFactory sale = new MockSaleFactory();
        MockRentFactory rent = new MockRentFactory();
        CommunityBoardRegistrar registrar = CommunityBoardRegistrar(
            address(
                new ERC1967Proxy(
                    address(new CommunityBoardRegistrar()),
                    abi.encodeCall(
                        CommunityBoardRegistrar.initialize,
                        (address(this), address(router), address(sale), address(rent))
                    )
                )
            )
        );
        router.setRegistrar(REVNET, address(registrar));
        registrar.setOperator(address(this), true);
        bytes32 id = bytes32(uint256(7));
        CommunityBoardRegistrar.Integration memory created =
            registrar.createBoard(REVNET, 8453, id, CommunityBoardRegistrar.Strategy.Sale, "Sample", "Revnet", "7");
        assertEq(created.board, address(0xA11));
        assertEq(sale.lastBeneficiary(), created.vault);
        bytes32 boardKey = RevenueIdentity.key(REVNET, 8453, id);
        (address storedVault, address storedBoard,, CommunityBoardRegistrar.Strategy strategy) =
            registrar.integrations(boardKey);
        assertEq(storedVault, created.vault);
        assertEq(storedBoard, created.board);
        assertEq(uint8(strategy), uint8(CommunityBoardRegistrar.Strategy.Sale));
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(REVNET, 8453, id, CommunityBoardRegistrar.Strategy.Rent, "Other", "Revnet", "7");
        router.setReceiver(8453, address(0));
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET, 8453, bytes32(uint256(8)), CommunityBoardRegistrar.Strategy.Rent, "Other", "Revnet", "8"
        );
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        registrar.createBoard(
            REVNET, 8453, bytes32(uint256(8)), CommunityBoardRegistrar.Strategy.Rent, "Other", "Revnet", "8"
        );
    }

    function testGivethPrototypeDeliversToCurrentBaseRecipientAndEscrowsOutage() public {
        MockGivethProjectData source = new MockGivethProjectData();
        source.set(address(0xCAFE), true);
        GivethProjectAdapterPrototype adapter = GivethProjectAdapterPrototype(
            address(
                new ERC1967Proxy(
                    address(new GivethProjectAdapterPrototype()),
                    abi.encodeCall(
                        GivethProjectAdapterPrototype.initialize, (address(this), address(receiver), address(source))
                    )
                )
            )
        );
        receiver.setPlatformAdapter(GIVETH, address(adapter));
        bytes32 id = bytes32(uint256(42));
        RevenueEnvelope memory delivery =
            RevenueEnvelope(bytes32(uint256(1)), RevenueIdentity.key(GIVETH, 8453, id), GIVETH, id);
        receiver.receiveNative{value: 1 ether}(delivery);
        assertEq(address(0xCAFE).balance, 1 ether);
        source.set(address(0xBEEF), true);
        delivery.payoutId = bytes32(uint256(2));
        receiver.receiveNative{value: 2 ether}(delivery);
        assertEq(address(0xBEEF).balance, 2 ether);
        source.set(address(0xBEEF), false);
        delivery.payoutId = bytes32(uint256(3));
        bytes32 receipt = receiver.receiveNative{value: 1 ether}(delivery);
        assertEq(receiver.escrowed(address(0)), 1 ether);
        source.set(address(0xD00D), true);
        receiver.retryPayout(receipt);
        assertEq(address(0xD00D).balance, 1 ether);
        assertEq(receiver.escrowed(address(0)), 0);
    }

    function testAdoptionRequiresPreparedVaultAndVerifiedExistingBoard() public {
        MockSaleFactory sale = new MockSaleFactory();
        MockRentFactory rent = new MockRentFactory();
        CommunityBoardRegistrar registrar = CommunityBoardRegistrar(
            address(
                new ERC1967Proxy(
                    address(new CommunityBoardRegistrar()),
                    abi.encodeCall(
                        CommunityBoardRegistrar.initialize,
                        (address(this), address(router), address(sale), address(rent))
                    )
                )
            )
        );
        bytes32 gardens = keccak256("gardens");
        router.setRegistrar(gardens, address(registrar));
        bytes32 id = bytes32(uint256(uint160(address(0x1234))));
        address vault = registrar.prepareExistingVault(gardens, 8453, id);
        MockExistingBoard board = new MockExistingBoard(address(rent), address(0xA11));
        rent.setAdoptedBoard(address(board));
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.adoptExistingBoard(
            gardens, 8453, id, CommunityBoardRegistrar.Strategy.Rent, address(board), address(0xA11)
        );
        board.setBeneficiary(vault);
        registrar.adoptExistingBoard(
            gardens, 8453, id, CommunityBoardRegistrar.Strategy.Rent, address(board), address(0xA11)
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.adoptExistingBoard(
            gardens, 8453, id, CommunityBoardRegistrar.Strategy.Rent, address(board), address(0xA11)
        );
    }
}
