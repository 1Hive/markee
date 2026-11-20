// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueUpgradeable} from "./RevenueUpgradeable.sol";
import {RevenueIdentity} from "./RevenueTypes.sol";

interface IPlatformSaleFactory {
    function createLeaderboard(address beneficiary, string calldata name)
        external
        returns (address board, address seedMarkee);
}

interface IPlatformRentFactory {
    function createLeaderboard(
        address beneficiary,
        string calldata name,
        string calldata platformName,
        string calldata platformKey
    ) external returns (address board, address seedMarkee);
}

interface IPlatformBoard {
    function admin() external view returns (address);
    function beneficiaryAddress() external view returns (address);
    function setAdmin(address newAdmin) external;
}

interface IPlatformRentBoard {
    function transferMarkeeOwnership(address markee, address newOwner) external;
}

/// @notice One Base leaderboard per registered platform identity. No vault or bridge is involved.
/// @dev Markee's API verifies the platform owner's signed activation before its operator calls createBoard.
contract PlatformBoardRegistrar is RevenueUpgradeable {
    enum Strategy {
        None,
        Sale,
        Rent
    }

    struct Integration {
        address board;
        address seedMarkee;
        Strategy strategy;
        address activator;
        address initialBeneficiary;
    }

    address public saleFactory;
    address public rentFactory;
    mapping(address => bool) public operators;
    mapping(bytes32 => Integration) public integrations;
    uint256[45] private __gap;

    event OperatorSet(address indexed operator, bool enabled);
    event FactoriesSet(address indexed saleFactory, address indexed rentFactory);
    event SeedMarkeeTransferred(bytes32 indexed key, address indexed seedMarkee, address indexed newOwner);
    event BoardRegistered(
        bytes32 indexed key,
        bytes32 indexed platformId,
        uint256 chainId,
        bytes32 communityId,
        Strategy strategy,
        address board,
        address seedMarkee,
        address activator,
        address beneficiary
    );

    function initialize(address owner_, address saleFactory_, address rentFactory_) external initializer {
        if (saleFactory_.code.length == 0 || rentFactory_.code.length == 0) revert InvalidConfiguration();
        _initializeOwner(owner_);
        saleFactory = saleFactory_;
        rentFactory = rentFactory_;
    }

    function setOperator(address operator, bool enabled) external onlyOwner {
        if (operator == address(0)) revert InvalidConfiguration();
        operators[operator] = enabled;
        emit OperatorSet(operator, enabled);
    }

    function setFactories(address saleFactory_, address rentFactory_) external onlyOwner {
        if (saleFactory_.code.length == 0 || rentFactory_.code.length == 0) revert InvalidConfiguration();
        saleFactory = saleFactory_;
        rentFactory = rentFactory_;
        emit FactoriesSet(saleFactory_, rentFactory_);
    }

    function createBoard(
        bytes32 platformId,
        uint256 chainId,
        bytes32 communityId,
        Strategy strategy,
        address activator,
        address beneficiary,
        string calldata name,
        string calldata platformName,
        string calldata platformKey
    ) external nonReentrant returns (Integration memory integration) {
        if (!operators[msg.sender]) revert Unauthorized();
        if (
            platformId == bytes32(0) || chainId == 0 || communityId == bytes32(0)
                || (strategy != Strategy.Sale && strategy != Strategy.Rent) || activator == address(0)
                || beneficiary == address(0) || bytes(name).length == 0
        ) {
            revert InvalidConfiguration();
        }
        bytes32 key = RevenueIdentity.key(platformId, chainId, communityId);
        if (integrations[key].board != address(0)) revert InvalidConfiguration();
        address board;
        address seedMarkee;
        if (strategy == Strategy.Sale) {
            (board, seedMarkee) = IPlatformSaleFactory(saleFactory).createLeaderboard(beneficiary, name);
        } else {
            (board, seedMarkee) =
                IPlatformRentFactory(rentFactory).createLeaderboard(beneficiary, name, platformName, platformKey);
        }
        if (
            board.code.length == 0 || seedMarkee == address(0)
                || IPlatformBoard(board).beneficiaryAddress() != beneficiary
                || IPlatformBoard(board).admin() != address(this)
        ) revert InvalidConfiguration();
        IPlatformBoard(board).setAdmin(activator);
        // Some sale boards require the new admin to accept on Base. Others transfer immediately.
        address admin = IPlatformBoard(board).admin();
        if (admin != activator && admin != address(this)) revert InvalidConfiguration();
        integration = Integration(board, seedMarkee, strategy, activator, beneficiary);
        integrations[key] = integration;
        emit BoardRegistered(key, platformId, chainId, communityId, strategy, board, seedMarkee, activator, beneficiary);
    }

    /// @notice The board's current admin takes over the seed Markee the factory assigned to this registrar.
    /// @dev Only For Rent boards expose a seed-ownership transfer; For Sale v1.4 boards do not.
    function transferSeedMarkee(bytes32 key, address newOwner) external nonReentrant {
        Integration memory integration = integrations[key];
        if (integration.board == address(0) || integration.strategy != Strategy.Rent || newOwner == address(0)) {
            revert InvalidConfiguration();
        }
        if (msg.sender != IPlatformBoard(integration.board).admin()) revert Unauthorized();
        IPlatformRentBoard(integration.board).transferMarkeeOwnership(integration.seedMarkee, newOwner);
        emit SeedMarkeeTransferred(key, integration.seedMarkee, newOwner);
    }
}
