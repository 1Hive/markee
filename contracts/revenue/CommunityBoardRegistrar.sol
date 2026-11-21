// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueUpgradeable} from "./RevenueUpgradeable.sol";
import {RevenueIdentity} from "./RevenueTypes.sol";

interface ICommunityVaultRouter {
    function registerCommunity(bytes32 platformId, uint256 chainId, bytes32 communityId)
        external
        returns (address vault);
    function receivers(uint256 chainId) external view returns (address);
}

interface ICommunitySaleFactory {
    function createLeaderboard(address beneficiary, string calldata name)
        external
        returns (address board, address seedMarkee);
}

interface ICommunityRentFactory {
    function createLeaderboard(
        address beneficiary,
        string calldata name,
        string calldata platformName,
        string calldata platformKey
    ) external returns (address board, address seedMarkee);
}

interface ICommunityBoard {
    function beneficiaryAddress() external view returns (address);
    function factory() external view returns (address);
    function isMarkeeOnLeaderboard(address markee) external view returns (bool);
}

interface ICommunityBoardAdmin {
    function setAdmin(address newAdmin) external;
    function transferMarkeeOwnership(address markee, address newOwner) external;
}

interface ICommunityBoardFactory {
    function isFactoryLeaderboard(address board) external view returns (bool);
}

/// @notice One board and one strategy for a platform/community identity.
/// @dev Governance must grant this contract registrar rights on CommunityRevenueRouter.
/// The Markee API independently verifies the community signer's authorization before
/// its operator asks this contract to create a board.
contract CommunityBoardRegistrar is RevenueUpgradeable {
    enum Strategy {
        None,
        Sale,
        Rent
    }

    struct Integration {
        address vault;
        address board;
        address seedMarkee;
        Strategy strategy;
    }

    ICommunityVaultRouter public router;
    address public saleFactory;
    address public rentFactory;
    mapping(address => bool) public operators;
    mapping(bytes32 => Integration) public integrations;
    uint256[44] private __gap;

    event OperatorSet(address indexed operator, bool enabled);
    event BoardAdminHandedOff(bytes32 indexed key, address indexed board, address indexed newAdmin);
    event SeedMarkeeTransferred(bytes32 indexed key, address indexed seedMarkee, address indexed newOwner);
    event FactoriesSet(address indexed saleFactory, address indexed rentFactory);
    event BoardRegistered(
        bytes32 indexed key,
        bytes32 indexed platformId,
        uint256 chainId,
        bytes32 communityId,
        Strategy strategy,
        address vault,
        address board,
        address seedMarkee
    );

    function initialize(address owner_, address router_, address saleFactory_, address rentFactory_)
        external
        initializer
    {
        if (router_.code.length == 0 || saleFactory_.code.length == 0 || rentFactory_.code.length == 0) {
            revert InvalidConfiguration();
        }
        _initializeOwner(owner_);
        router = ICommunityVaultRouter(router_);
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
        string calldata name,
        string calldata platformName,
        string calldata platformKey
    ) external nonReentrant returns (Integration memory integration) {
        if (!operators[msg.sender]) revert Unauthorized();
        if (
            platformId == bytes32(0) || chainId == 0 || communityId == bytes32(0) || strategy == Strategy.None
                || bytes(name).length == 0
        ) revert InvalidConfiguration();
        bytes32 key = RevenueIdentity.key(platformId, chainId, communityId);
        if (integrations[key].board != address(0)) revert InvalidConfiguration();
        // Never point a newly created board at a vault that has no delivery
        // destination. Cross-chain routes still require an operational preflight.
        if (router.receivers(chainId) == address(0)) revert InvalidConfiguration();
        address vault = router.registerCommunity(platformId, chainId, communityId);
        address board;
        address seedMarkee;
        if (strategy == Strategy.Sale) {
            (board, seedMarkee) = ICommunitySaleFactory(saleFactory).createLeaderboard(vault, name);
        } else {
            (board, seedMarkee) =
                ICommunityRentFactory(rentFactory).createLeaderboard(vault, name, platformName, platformKey);
        }
        if (board == address(0) || seedMarkee == address(0)) revert InvalidConfiguration();
        integration = Integration(vault, board, seedMarkee, strategy);
        integrations[key] = integration;
        emit BoardRegistered(key, platformId, chainId, communityId, strategy, vault, board, seedMarkee);
    }

    /// @notice Governance hands off admin of a board this registrar created (the factory made it the admin).
    /// @dev The new admin can change the board beneficiary away from the vault; this is the same trust as an upgrade.
    function setBoardAdmin(bytes32 key, address newAdmin) external onlyOwner nonReentrant {
        address board = integrations[key].board;
        if (board == address(0) || newAdmin == address(0)) revert InvalidConfiguration();
        ICommunityBoardAdmin(board).setAdmin(newAdmin);
        emit BoardAdminHandedOff(key, board, newAdmin);
    }

    /// @notice Governance transfers the registrar-owned seed Markee. Only For Rent boards support this.
    function transferSeedMarkee(bytes32 key, address newOwner) external onlyOwner nonReentrant {
        Integration memory integration = integrations[key];
        if (integration.board == address(0) || integration.strategy != Strategy.Rent || newOwner == address(0)) {
            revert InvalidConfiguration();
        }
        ICommunityBoardAdmin(integration.board).transferMarkeeOwnership(integration.seedMarkee, newOwner);
        emit SeedMarkeeTransferred(key, integration.seedMarkee, newOwner);
    }

    /// @notice Prepare a deterministic vault before a separately governed board migration.
    /// This does not change any existing leaderboard, stream, or beneficiary.
    function prepareExistingVault(bytes32 platformId, uint256 chainId, bytes32 communityId)
        external
        onlyOwner
        returns (address vault)
    {
        if (
            platformId == bytes32(0) || chainId == 0 || communityId == bytes32(0)
                || router.receivers(chainId) == address(0)
        ) revert InvalidConfiguration();
        if (integrations[RevenueIdentity.key(platformId, chainId, communityId)].board != address(0)) {
            revert InvalidConfiguration();
        }
        return router.registerCommunity(platformId, chainId, communityId);
    }

    /// @notice Adopt one pre-existing board only after its admin has pointed it at
    /// the prepared vault. Governance must review that prior migration separately.
    function adoptExistingBoard(
        bytes32 platformId,
        uint256 chainId,
        bytes32 communityId,
        Strategy strategy,
        address board,
        address seedMarkee
    ) external onlyOwner {
        if (
            platformId == bytes32(0) || chainId == 0 || communityId == bytes32(0) || strategy == Strategy.None
                || board.code.length == 0 || seedMarkee == address(0)
        ) {
            revert InvalidConfiguration();
        }
        bytes32 key = RevenueIdentity.key(platformId, chainId, communityId);
        if (integrations[key].board != address(0)) revert InvalidConfiguration();
        address vault = router.registerCommunity(platformId, chainId, communityId);
        address factory = strategy == Strategy.Sale ? saleFactory : rentFactory;
        if (
            ICommunityBoard(board).beneficiaryAddress() != vault || ICommunityBoard(board).factory() != factory
                || !ICommunityBoardFactory(factory).isFactoryLeaderboard(board)
                || !ICommunityBoard(board).isMarkeeOnLeaderboard(seedMarkee)
        ) revert InvalidConfiguration();
        integrations[key] = Integration(vault, board, seedMarkee, strategy);
        emit BoardRegistered(key, platformId, chainId, communityId, strategy, vault, board, seedMarkee);
    }
}
