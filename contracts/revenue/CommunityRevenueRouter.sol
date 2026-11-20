// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {RevenueUpgradeable} from "./RevenueUpgradeable.sol";
import {CommunityRevenueVault} from "./CommunityRevenueVault.sol";
import {
    RevenueEnvelope,
    RevenueBridgeRequest,
    RevenueIdentity,
    ICommunityRevenueReceiver,
    IRevenueBridgeAdapter
} from "./RevenueTypes.sol";

contract CommunityRevenueRouter is RevenueUpgradeable {
    struct Community {
        bytes32 platformId;
        bytes32 communityId;
        uint256 destinationChainId;
        address vault;
    }
    address public vaultImplementation;
    address public ethx;
    address public weth;
    uint256 public payoutNonce;
    uint16 public maxKeeperFeeBps;
    uint16 public maxBridgeLossBps;
    mapping(bytes32 => address) public registrars;
    mapping(address => bool) public keepers;
    mapping(bytes32 => Community) public communities;
    mapping(uint256 => address) public receivers;
    mapping(uint256 => mapping(bytes32 => address)) public bridgeAdapters;
    /// @notice Per-community nonce so one community's sweep never invalidates another's quotes.
    mapping(bytes32 => uint256) public communityPayoutNonce;
    uint256[39] private __gap;

    event RegistrarSet(bytes32 indexed platformId, address indexed registrar);
    event KeeperSet(address indexed keeper, bool enabled);
    event ReceiverSet(uint256 indexed chainId, address indexed receiver);
    event BridgeSet(uint256 indexed chainId, bytes32 indexed protocol, address indexed adapter);
    event FeeLimitsSet(uint16 keeperBps, uint16 bridgeLossBps);
    event CommunityRegistered(
        bytes32 indexed communityKey,
        bytes32 indexed platformId,
        bytes32 communityId,
        uint256 destinationChainId,
        address vault
    );
    event RevenueSwept(
        bytes32 indexed payoutId,
        bytes32 indexed communityKey,
        bytes32 indexed transferId,
        uint256 grossAmount,
        uint256 keeperFee,
        uint256 minimumOutput
    );

    function initialize(address owner_, address vaultImplementation_, address ethx_, address weth_)
        external
        initializer
    {
        if (vaultImplementation_.code.length == 0 || ethx_.code.length == 0 || weth_.code.length == 0 || ethx_ == weth_)
        {
            revert InvalidConfiguration();
        }
        _initializeOwner(owner_);
        vaultImplementation = vaultImplementation_;
        ethx = ethx_;
        weth = weth_;
        maxKeeperFeeBps = 100;
        maxBridgeLossBps = 100;
    }

    receive() external payable {}

    function setRegistrar(bytes32 platformId, address registrar) external onlyOwner {
        if (platformId == bytes32(0)) revert InvalidConfiguration();
        registrars[platformId] = registrar;
        emit RegistrarSet(platformId, registrar);
    }

    function setKeeper(address keeper, bool enabled) external onlyOwner {
        if (keeper == address(0)) revert InvalidConfiguration();
        keepers[keeper] = enabled;
        emit KeeperSet(keeper, enabled);
    }

    function setReceiver(uint256 chainId, address receiver) external onlyOwner {
        if (chainId == 0 || (chainId == block.chainid && receiver != address(0) && receiver.code.length == 0)) {
            revert InvalidConfiguration();
        }
        receivers[chainId] = receiver;
        emit ReceiverSet(chainId, receiver);
    }

    function setBridge(uint256 chainId, bytes32 protocol, address adapter) external onlyOwner {
        if (chainId == 0 || protocol == bytes32(0) || (adapter != address(0) && adapter.code.length == 0)) {
            revert InvalidConfiguration();
        }
        bridgeAdapters[chainId][protocol] = adapter;
        emit BridgeSet(chainId, protocol, adapter);
    }

    function setFeeLimits(uint16 keeperBps, uint16 bridgeLossBps) external onlyOwner {
        if (keeperBps > 1000 || bridgeLossBps > 1000) revert InvalidConfiguration();
        maxKeeperFeeBps = keeperBps;
        maxBridgeLossBps = bridgeLossBps;
        emit FeeLimitsSet(keeperBps, bridgeLossBps);
    }

    function registerCommunity(bytes32 platformId, uint256 chainId, bytes32 communityId)
        external
        nonReentrant
        returns (address vault)
    {
        if (msg.sender != registrars[platformId]) revert Unauthorized();
        if (platformId == bytes32(0) || communityId == bytes32(0) || chainId == 0) revert InvalidConfiguration();
        bytes32 key = RevenueIdentity.key(platformId, chainId, communityId);
        vault = communities[key].vault;
        if (vault != address(0)) return vault;
        vault = Clones.cloneDeterministic(vaultImplementation, key);
        CommunityRevenueVault(payable(vault)).initialize(key, ethx, weth);
        communities[key] = Community(platformId, communityId, chainId, vault);
        emit CommunityRegistered(key, platformId, communityId, chainId, vault);
    }

    function predictVault(bytes32 platformId, uint256 chainId, bytes32 communityId) external view returns (address) {
        return Clones.predictDeterministicAddress(
            vaultImplementation, RevenueIdentity.key(platformId, chainId, communityId), address(this)
        );
    }

    /// @notice Preview the next ID before asking providers to construct destination calldata.
    /// A concurrent sweep of the same community changes its nonce and invalidates, rather than silently alters, a quote.
    function nextPayoutId(bytes32 key) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), communityPayoutNonce[key], key));
    }

    function sweep(
        bytes32 key,
        bytes32 expectedPayoutId,
        uint256 grossAmount,
        uint256 keeperFee,
        bytes32 protocol,
        uint256 minimumOutput,
        bytes calldata quoteData
    ) external payable nonReentrant {
        if (!keepers[msg.sender]) revert Unauthorized();
        Community memory c = communities[key];
        address receiver = receivers[c.destinationChainId];
        if (c.vault == address(0) || receiver == address(0) || expectedPayoutId != nextPayoutId(key)) {
            revert InvalidConfiguration();
        }
        if (grossAmount == 0 || keeperFee > grossAmount * maxKeeperFeeBps / 10_000) revert InvalidAmount();
        uint256 amount = grossAmount - keeperFee;
        RevenueEnvelope memory envelope = RevenueEnvelope(expectedPayoutId, key, c.platformId, c.communityId);
        payoutNonce++; // Total sweeps across all communities.
        communityPayoutNonce[key]++;
        CommunityRevenueVault(payable(c.vault)).releaseRevenue(grossAmount);
        bytes32 transferId;
        uint256 output;
        if (c.destinationChainId == block.chainid) {
            if (msg.value != 0 || protocol != bytes32(0) || quoteData.length != 0) revert InvalidConfiguration();
            if (amount < minimumOutput) revert InvalidAmount();
            transferId = ICommunityRevenueReceiver(receiver).receiveLocal{value: amount}(envelope);
            output = amount;
        } else {
            address adapter = bridgeAdapters[c.destinationChainId][protocol];
            if (adapter == address(0)) revert InvalidConfiguration();
            if (minimumOutput == 0 || minimumOutput < amount - amount * maxBridgeLossBps / 10_000) {
                revert InvalidAmount();
            }
            RevenueBridgeRequest memory request =
                RevenueBridgeRequest(c.destinationChainId, receiver, c.vault, amount, minimumOutput, envelope);
            (transferId, output) =
                IRevenueBridgeAdapter(adapter).bridgeETH{value: amount + msg.value}(request, quoteData);
            if (output < minimumOutput) revert InvalidAmount();
        }
        if (keeperFee != 0) {
            (bool success,) = payable(msg.sender).call{value: keeperFee}("");
            if (!success) revert TransferFailed();
        }
        emit RevenueSwept(expectedPayoutId, key, transferId, grossAmount, keeperFee, output);
    }
}
