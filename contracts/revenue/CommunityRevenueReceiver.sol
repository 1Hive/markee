// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RevenueUpgradeable} from "./RevenueUpgradeable.sol";
import {RevenueEnvelope, RevenueIdentity, ICommunityTransferAdapter, IRevenueWETH} from "./RevenueTypes.sol";

/// @notice Shared custody/retry layer; only platform adapters interpret communityId.
/// @dev Shared bridge dispatchers do not authenticate a source router. Every funded
/// bridge receipt gets a fresh local ID: supplied payout IDs are correlation data,
/// never keys an attacker can pre-consume. Existing escrow is never used to fund a callback.
contract CommunityRevenueReceiver is RevenueUpgradeable {
    enum Status {
        None,
        Pending,
        Delivered,
        Recovered
    }

    struct Payout {
        RevenueEnvelope envelope;
        address token;
        uint256 amount;
        Status status;
    }

    struct Asset {
        bool enabled;
        bool unwrap;
    }
    uint256 public receiptNonce;
    address public acrossSpokePool;
    bool public nativeEnabled;
    mapping(address => Asset) public assets;
    mapping(address => bool) public executors;
    mapping(address => bool) public localRouters;
    mapping(bytes32 => address) public platformAdapters;
    mapping(bytes32 => Payout) public payouts;
    mapping(address => uint256) public escrowed;
    mapping(bytes32 => bool) public processedLocalIds;
    uint256[40] private __gap;

    uint256 public constant DELIVERY_GAS = 900_000;
    uint256 public constant ESCROW_GAS_RESERVE = 180_000;
    event PlatformAdapterSet(bytes32 indexed platformId, address indexed adapter);
    event ExecutorSet(address indexed executor, bool enabled);
    event LocalRouterSet(address indexed router, bool enabled);
    event AssetSet(address indexed token, bool enabled, bool unwrap);
    event AcrossSpokePoolSet(address indexed spokePool);
    event RevenueReceived(
        bytes32 indexed receiptId,
        bytes32 indexed sourcePayoutId,
        bytes32 indexed communityKey,
        address sender,
        address token,
        uint256 amount
    );
    event PayoutDelivered(bytes32 indexed receiptId, address indexed adapter, address token, uint256 amount);
    event PayoutEscrowed(bytes32 indexed receiptId);
    event PayoutRecovered(bytes32 indexed receiptId, address indexed recipient);
    event SurplusRecovered(address indexed token, address indexed recipient, uint256 amount);

    function initialize(address owner_, bool acceptsNativeETH) external initializer {
        _initializeOwner(owner_);
        nativeEnabled = acceptsNativeETH;
    }

    receive() external payable {
        // Only configured native wrappers may send unaccounted native tokens.
        // On Gnosis, bridged WETH is configured with unwrap=false.
        if (!assets[msg.sender].unwrap) revert Unauthorized();
    }

    function setPlatformAdapter(bytes32 platformId, address adapter) external onlyOwner {
        if (platformId == bytes32(0) || (adapter != address(0) && adapter.code.length == 0)) {
            revert InvalidConfiguration();
        }
        platformAdapters[platformId] = adapter;
        emit PlatformAdapterSet(platformId, adapter);
    }

    function setExecutor(address executor, bool enabled) external onlyOwner {
        if (executor == address(0)) revert InvalidConfiguration();
        executors[executor] = enabled;
        emit ExecutorSet(executor, enabled);
    }

    function setLocalRouter(address router, bool enabled) external onlyOwner {
        if (router == address(0)) revert InvalidConfiguration();
        localRouters[router] = enabled;
        emit LocalRouterSet(router, enabled);
    }

    function setAsset(address token, bool enabled, bool unwrap) external onlyOwner {
        if (token.code.length == 0 || (unwrap && !nativeEnabled) || (unwrap && !enabled)) {
            revert InvalidConfiguration();
        }
        assets[token] = Asset(enabled, unwrap);
        emit AssetSet(token, enabled, unwrap);
    }

    function setAcrossSpokePool(address spokePool) external onlyOwner {
        if (spokePool != address(0) && spokePool.code.length == 0) revert InvalidConfiguration();
        acrossSpokePool = spokePool;
        emit AcrossSpokePoolSet(spokePool);
    }

    function receiveLocal(RevenueEnvelope calldata envelope) external payable nonReentrant returns (bytes32) {
        if (!localRouters[msg.sender] || !nativeEnabled) revert Unauthorized();
        bytes32 replayKey = keccak256(abi.encode(msg.sender, envelope.payoutId));
        if (processedLocalIds[replayKey]) revert Unauthorized();
        processedLocalIds[replayKey] = true;
        return _record(envelope, address(0), msg.value);
    }

    function receiveNative(RevenueEnvelope calldata envelope) external payable nonReentrant returns (bytes32) {
        if (!executors[msg.sender] || !nativeEnabled) revert Unauthorized();
        return _record(envelope, address(0), msg.value);
    }

    function receiveToken(RevenueEnvelope calldata envelope, address token, uint256 amount)
        external
        nonReentrant
        returns (bytes32)
    {
        if (!executors[msg.sender]) revert Unauthorized();
        if (!assets[token].enabled || amount == 0) revert InvalidAmount();
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) != beforeBalance + amount) revert InvalidAmount();
        return _normalizeAndRecord(envelope, token, amount);
    }

    function handleV3AcrossMessage(address token, uint256 amount, address, bytes calldata message)
        external
        nonReentrant
    {
        if (msg.sender != acrossSpokePool || msg.sender == address(0)) revert Unauthorized();
        if (!assets[token].enabled || amount == 0) revert InvalidAmount();
        // Across transfers tokens before invoking this hook. Never consume token escrow.
        if (IERC20(token).balanceOf(address(this)) < escrowed[token] + amount) revert InvalidAmount();
        RevenueEnvelope memory envelope = abi.decode(message, (RevenueEnvelope));
        _normalizeAndRecord(envelope, token, amount);
    }

    function _normalizeAndRecord(RevenueEnvelope memory envelope, address token, uint256 amount)
        internal
        returns (bytes32)
    {
        if (assets[token].unwrap) {
            uint256 beforeBalance = address(this).balance;
            IRevenueWETH(token).withdraw(amount);
            if (address(this).balance != beforeBalance + amount) revert InvalidAmount();
            token = address(0);
        }
        return _record(envelope, token, amount);
    }

    function _record(RevenueEnvelope memory envelope, address token, uint256 amount) internal returns (bytes32 id) {
        if (amount == 0) revert InvalidAmount();
        if (
            envelope.platformId == bytes32(0) || envelope.communityId == bytes32(0) || envelope.payoutId == bytes32(0)
                || envelope.communityKey
                    != RevenueIdentity.key(envelope.platformId, block.chainid, envelope.communityId)
        ) {
            revert InvalidConfiguration();
        }
        id = keccak256(abi.encode(block.chainid, address(this), receiptNonce++));
        payouts[id] = Payout(envelope, token, amount, Status.Pending);
        escrowed[token] += amount;
        emit RevenueReceived(id, envelope.payoutId, envelope.communityKey, msg.sender, token, amount);
        if (!_attempt(id)) emit PayoutEscrowed(id);
    }

    /// @dev Isolate approvals, delivery, and checks in one subcall. On failure all
    /// adapter side effects revert, including any temporary ERC20 approval.
    function executeDelivery(bytes32 id) external {
        if (msg.sender != address(this)) revert Unauthorized();
        Payout storage p = payouts[id];
        if (p.status != Status.Pending) revert InvalidConfiguration();
        address adapter = platformAdapters[p.envelope.platformId];
        if (adapter.code.length == 0) revert InvalidConfiguration();
        p.status = Status.Delivered;
        escrowed[p.token] -= p.amount;
        if (p.token == address(0)) {
            ICommunityTransferAdapter(adapter).transferToCommunity{value: p.amount}(
                p.envelope.communityId, id, address(0), p.amount
            );
        } else {
            uint256 beforeBalance = IERC20(p.token).balanceOf(address(this));
            SafeERC20.forceApprove(IERC20(p.token), adapter, p.amount);
            ICommunityTransferAdapter(adapter).transferToCommunity(p.envelope.communityId, id, p.token, p.amount);
            SafeERC20.forceApprove(IERC20(p.token), adapter, 0);
            if (IERC20(p.token).balanceOf(address(this)) != beforeBalance - p.amount) revert TransferFailed();
        }
        emit PayoutDelivered(id, adapter, p.token, p.amount);
    }

    function _attempt(bytes32 id) internal returns (bool success) {
        // Reserve enough gas to persist/emit escrow even if a platform burns all
        // supplied gas. Do not copy unbounded revert data from an external adapter.
        uint256 available = gasleft();
        if (available < ESCROW_GAS_RESERVE + 100_000) return false;
        bytes memory data = abi.encodeCall(this.executeDelivery, (id));
        uint256 limit = available - ESCROW_GAS_RESERVE;
        if (limit > DELIVERY_GAS) limit = DELIVERY_GAS;
        address target = address(this);
        assembly ("memory-safe") { success := call(limit, target, 0, add(data, 32), mload(data), 0, 0) }
    }

    function retryPayout(bytes32 id) external nonReentrant {
        if (payouts[id].status != Status.Pending) revert InvalidConfiguration();
        if (!_attempt(id)) revert TransferFailed();
    }

    function recoverPayout(bytes32 id, address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        Payout storage p = payouts[id];
        if (p.status != Status.Pending) revert InvalidConfiguration();
        p.status = Status.Recovered;
        escrowed[p.token] -= p.amount;
        if (p.token == address(0)) {
            (bool success,) = recipient.call{value: p.amount}("");
            if (!success) revert TransferFailed();
        } else {
            SafeERC20.safeTransfer(IERC20(p.token), recipient, p.amount);
        }
        emit PayoutRecovered(id, recipient);
    }

    /// @notice Recover unsolicited tokens or provider residuals after reconciling
    /// provider events. Cannot spend funds reserved for pending community payouts.
    function recoverSurplus(address token, address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        uint256 balance = token == address(0) ? address(this).balance : IERC20(token).balanceOf(address(this));
        uint256 amount = balance - escrowed[token];
        if (amount == 0) revert InvalidAmount();
        if (token == address(0)) {
            (bool success,) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            SafeERC20.safeTransfer(IERC20(token), recipient, amount);
        }
        emit SurplusRecovered(token, recipient, amount);
    }
}
