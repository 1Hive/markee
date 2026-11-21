// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PlatformBoardRegistrar} from "../../contracts/revenue/PlatformBoardRegistrar.sol";
import {RevenueIdentity} from "../../contracts/revenue/RevenueTypes.sol";
import {RevenueUpgradeable} from "../../contracts/revenue/RevenueUpgradeable.sol";

contract DirectBoardMock {
    address public admin;
    address public pendingAdmin;
    address public beneficiaryAddress;
    address public seedOwner;
    bool public immutable twoStep;

    constructor(address owner, address beneficiary, bool pending) {
        admin = owner;
        seedOwner = owner;
        beneficiaryAddress = beneficiary;
        twoStep = pending;
    }

    function setAdmin(address next) external {
        require(msg.sender == admin);
        if (twoStep) pendingAdmin = next;
        else admin = next;
    }

    function transferMarkeeOwnership(address, address next) external {
        require(msg.sender == seedOwner);
        seedOwner = next;
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin);
        admin = msg.sender;
        pendingAdmin = address(0);
    }
}

contract DirectSaleFactoryMock {
    function createLeaderboard(address beneficiary, string calldata)
        external
        returns (address board, address seedMarkee)
    {
        board = address(new DirectBoardMock(msg.sender, beneficiary, true));
        seedMarkee = address(0xA11);
    }
}

contract DirectRentFactoryMock {
    function createLeaderboard(address beneficiary, string calldata, string calldata, string calldata)
        external
        returns (address board, address seedMarkee)
    {
        board = address(new DirectBoardMock(msg.sender, beneficiary, false));
        seedMarkee = address(0xB11);
    }
}

contract WrongBeneficiaryFactoryMock {
    function createLeaderboard(address, string calldata) external returns (address board, address seedMarkee) {
        board = address(new DirectBoardMock(msg.sender, address(0xBAD), true));
        seedMarkee = address(0xA11);
    }
}

contract InvalidSaleFactoryMock {
    enum Failure {
        NoBoard,
        NoSeed,
        WrongAdmin
    }
    Failure public immutable failure;

    constructor(Failure failure_) {
        failure = failure_;
    }

    function createLeaderboard(address beneficiary, string calldata)
        external
        returns (address board, address seedMarkee)
    {
        if (failure != Failure.NoBoard) {
            board = address(
                new DirectBoardMock(failure == Failure.WrongAdmin ? address(this) : msg.sender, beneficiary, true)
            );
        }
        if (failure != Failure.NoSeed) seedMarkee = address(0xA11);
    }
}

contract PlatformBoardRegistrarTest is Test {
    bytes32 constant REVNET = keccak256("revnet");
    bytes32 constant PROJECT = bytes32(uint256(42));
    address constant ACTIVATOR = address(0xA1);
    address constant BENEFICIARY = address(0xB1);
    PlatformBoardRegistrar registrar;

    function setUp() public {
        registrar = PlatformBoardRegistrar(
            address(
                new ERC1967Proxy(
                    address(new PlatformBoardRegistrar()),
                    abi.encodeCall(
                        PlatformBoardRegistrar.initialize,
                        (address(this), address(new DirectSaleFactoryMock()), address(new DirectRentFactoryMock()))
                    )
                )
            )
        );
        registrar.setOperator(address(this), true);
    }

    function testSaleDirectBeneficiaryAndPendingAdmin() public {
        PlatformBoardRegistrar.Integration memory created = registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        DirectBoardMock board = DirectBoardMock(created.board);
        assertEq(board.beneficiaryAddress(), BENEFICIARY);
        assertEq(board.admin(), address(registrar));
        assertEq(board.pendingAdmin(), ACTIVATOR);
        vm.prank(ACTIVATOR);
        board.acceptAdmin();
        assertEq(board.admin(), ACTIVATOR);
        bytes32 key = RevenueIdentity.key(REVNET, 8453, PROJECT);
        (address stored,,, address activator, address initialBeneficiary) = registrar.integrations(key);
        assertEq(stored, created.board);
        assertEq(activator, ACTIVATOR);
        assertEq(initialBeneficiary, BENEFICIARY);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Rent,
            ACTIVATOR,
            BENEFICIARY,
            "Duplicate",
            "Revnet",
            "42"
        );
    }

    function testRentImmediateAdminAndAuthorization() public {
        PlatformBoardRegistrar.Integration memory created = registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Rent,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        assertEq(DirectBoardMock(created.board).admin(), ACTIVATOR);
        assertEq(DirectBoardMock(created.board).beneficiaryAddress(), BENEFICIARY);
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        registrar.createBoard(
            REVNET,
            8453,
            bytes32(uint256(43)),
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Unauthorized",
            "Revnet",
            "43"
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET,
            8453,
            bytes32(uint256(43)),
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            address(0),
            "No beneficiary",
            "Revnet",
            "43"
        );
    }

    function testCurrentAdminClaimsRentSeedMarkee() public {
        PlatformBoardRegistrar.Integration memory created = registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Rent,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        bytes32 key = RevenueIdentity.key(REVNET, 8453, PROJECT);
        assertEq(DirectBoardMock(created.board).seedOwner(), address(registrar));
        vm.prank(address(0xBAD));
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        registrar.transferSeedMarkee(key, address(0xBAD));
        vm.prank(ACTIVATOR);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.transferSeedMarkee(key, address(0));
        vm.prank(ACTIVATOR);
        registrar.transferSeedMarkee(key, ACTIVATOR);
        assertEq(DirectBoardMock(created.board).seedOwner(), ACTIVATOR);
    }

    function testSaleSeedMarkeeHasNoTransfer() public {
        registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        vm.prank(ACTIVATOR);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.transferSeedMarkee(RevenueIdentity.key(REVNET, 8453, PROJECT), ACTIVATOR);
    }

    function testFactoryCannotRegisterWrongBeneficiaryOrLeavePartialMapping() public {
        registrar.setFactories(address(new WrongBeneficiaryFactoryMock()), address(new DirectRentFactoryMock()));
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        (address stored,,,,) = registrar.integrations(RevenueIdentity.key(REVNET, 8453, PROJECT));
        assertEq(stored, address(0));
    }

    function testInvalidFactoryResultsDoNotRegisterBoard() public {
        for (uint256 i; i < 3; i++) {
            registrar.setFactories(
                address(new InvalidSaleFactoryMock(InvalidSaleFactoryMock.Failure(i))),
                address(new DirectRentFactoryMock())
            );
            vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
            registrar.createBoard(
                REVNET,
                8453,
                PROJECT,
                PlatformBoardRegistrar.Strategy.Sale,
                ACTIVATOR,
                BENEFICIARY,
                "Project",
                "Revnet",
                "42"
            );
            (address stored,,,,) = registrar.integrations(RevenueIdentity.key(REVNET, 8453, PROJECT));
            assertEq(stored, address(0));
        }
    }

    function testRejectsInvalidIdentityStrategyAndActivator() public {
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            bytes32(0),
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET, 0, PROJECT, PlatformBoardRegistrar.Strategy.Sale, ACTIVATOR, BENEFICIARY, "Project", "Revnet", "42"
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET,
            8453,
            bytes32(0),
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.None,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Sale,
            address(0),
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.createBoard(
            REVNET, 8453, PROJECT, PlatformBoardRegistrar.Strategy.Sale, ACTIVATOR, BENEFICIARY, "", "Revnet", "42"
        );
    }

    function testOwnerControlsOperatorsAndFactories() public {
        address sale = address(new DirectSaleFactoryMock());
        address rent = address(new DirectRentFactoryMock());
        vm.prank(ACTIVATOR);
        vm.expectRevert();
        registrar.setOperator(ACTIVATOR, true);
        vm.prank(ACTIVATOR);
        vm.expectRevert();
        registrar.setFactories(sale, rent);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.setOperator(address(0), true);
        vm.expectRevert(RevenueUpgradeable.InvalidConfiguration.selector);
        registrar.setFactories(address(0), rent);
        registrar.setOperator(address(this), false);
        vm.expectRevert(RevenueUpgradeable.Unauthorized.selector);
        registrar.createBoard(
            REVNET,
            8453,
            PROJECT,
            PlatformBoardRegistrar.Strategy.Sale,
            ACTIVATOR,
            BENEFICIARY,
            "Project",
            "Revnet",
            "42"
        );
    }
}
