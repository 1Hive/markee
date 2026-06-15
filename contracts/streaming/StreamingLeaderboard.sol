// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { ISuperfluidPool } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/gdav1/ISuperfluidPool.sol";
import { PoolConfig } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/gdav1/IGeneralDistributionAgreementV1.sol";
import { SuperTokenV1Library } from
    "@superfluid-finance/ethereum-contracts/contracts/apps/SuperTokenV1Library.sol";
import { CFASuperAppBase } from
    "@superfluid-finance/ethereum-contracts/contracts/apps/CFASuperAppBase.sol";
import { ISETH } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/tokens/ISETH.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Markee } from "../v1.3/Markee.sol";
import { IPricingStrategy, ILeaderboardFactory, IJBMultiTerminal } from "../v1.3/Interfaces.sol";

/// @title StreamingLeaderboard (Option B — GDA-refund escrow)
/// @notice A SuperApp pricing strategy where backers stream a monthly ETHx rate into this contract
///         (tagged via `userData` with their target Markee). The Markee with the highest aggregate
///         active inflow holds #1. Every non-#1 Markee's GDA pool is refunded at its aggregate
///         (losers net ≈ zero); 62% of the #1's aggregate is forwarded to the beneficiary as one
///         CFA stream; 38% accrues for per-funder RevNet settlement.
///
/// @dev SCOPE — this is a compiling skeleton + happy-path implementation. Promotions flip inside the
///      inflow callback (O(1)); the decay/demotion direction is handled by the permissionless
///      `claimTop` poke. The per-funder RevNet settlement accumulator (`settle`) is stubbed behind
///      its real signature. Exact deposit/buffer accounting and full jail-safety hardening are
///      flagged TODO for the next pass.
///
/// @dev Deployed as an EIP-1167 clone of an implementation held by StreamingLeaderboardFactory. The
///      clone cannot self-register (its constructor never runs) — the factory registers each clone as
///      a SuperApp via host.registerApp() after cloning. HOST and ETHX are implementation immutables,
///      shared correctly by every clone (read from the implementation's runtime bytecode).
contract StreamingLeaderboard is CFASuperAppBase, IPricingStrategy {
    using SuperTokenV1Library for ISuperToken;

    string public constant VERSION = "streaming-1.0.0";
    uint256 public constant SECONDS_IN_MONTH = 2628000;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    /// @dev Superfluid liquidation (buffer) period on Base: 4h. Refund/forward flow buffers ≈ rate*this.
    uint256 public constant BUFFER_PERIOD = 14400;
    /// @dev Fixed-point scale for the rewards-per-unit settlement accumulator.
    uint256 public constant PRECISION = 1e18;
    /// @dev Juicebox native-token sentinel (ETH), passed to IJBMultiTerminal.pay (mirrors v1.3 Markee).
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);

    /// @notice The only SuperToken this leaderboard accepts (ETHx on Base). Implementation immutable.
    ISuperToken public immutable ETHX;

    // ─── Initialized-once per-clone config ────────────────────────────────────
    bool public initialized;
    address public factory;
    address public admin;
    address public override beneficiaryAddress;
    string public leaderboardName;
    address public markeeImplementation;
    uint256 public minimumMonthlyRate;
    uint256 public maxMessageLength;
    uint256 public maxNameLength;

    // ─── Markee registry ──────────────────────────────────────────────────────
    address[] public markees;
    mapping(address => uint256) private markeeIndex;
    mapping(address => bool) public isMarkeeOnLeaderboard;

    // ─── Per-Markee streaming state ───────────────────────────────────────────
    /// @notice GDA refund pool per Markee (members = backers, units = flowRate).
    mapping(address => ISuperfluidPool) public poolOf;
    /// @notice Sum of all backers' flow rates for a Markee (wei/sec) == total pool units == bid.
    mapping(address => uint256) public aggregateRate;
    /// @notice Current refund distributeFlow rate to a Markee's pool (0 for the #1 Markee).
    mapping(address => uint256) public refundRate;

    address public topMarkee;
    uint256 public topRate;

    // ─── Per-backer state (CFA allows one flow per sender→receiver, so one Markee per backer) ──
    mapping(address => address) public backerMarkee;
    mapping(address => uint256) public backerDeposit;

    // ─── Per-funder RevNet settlement accumulator (MasterChef-style, per Markee) ──
    /// @notice Cumulative ETHx-per-unit (scaled by PRECISION) accrued to a Markee's backers while
    ///         that Markee held #1. Only the current top Markee's accumulator advances over time;
    ///         it freezes the instant #1 flips away, so each backer earns only for the periods its
    ///         Markee was #1, pro-rata by flow rate (== its pool units).
    mapping(address => uint256) public accRevNetPerUnit;
    /// @notice Snapshot of `units * accRevNetPerUnit[backerMarkee] / PRECISION` at a backer's last
    ///         units change — the MasterChef "reward debt" baseline.
    mapping(address => uint256) public backerRewardDebt;
    /// @notice Realized-but-unsettled ETHx owed to a backer (moved here on every units change / settle).
    mapping(address => uint256) public claimable;
    /// @notice Last time the top Markee's accumulator was rolled forward (one global clock — only one
    ///         Markee is #1 at a time).
    uint256 public lastAccrualTime;

    // ─── Events ───────────────────────────────────────────────────────────────
    event MarkeeCreated(address indexed markeeAddress, address indexed owner, string message, string name);
    event MarkeeRegistered(address indexed markeeAddress, address indexed pool);
    event MarkeeLeft(address indexed markeeAddress);
    event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate);
    event TopChanged(address indexed oldTop, address indexed newTop, uint256 newTopRate);
    event DepositAdded(address indexed backer, uint256 amount, uint256 newBalance);
    event DepositWithdrawn(address indexed backer, uint256 amount);
    event MessageUpdated(address indexed markeeAddress, address indexed updatedBy, string newMessage);
    event NameUpdated(address indexed markeeAddress, address indexed updatedBy, string newName);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event MinimumMonthlyRateChanged(uint256 oldRate, uint256 newRate);
    event Settled(address indexed backer, uint256 amount, bool viaRevNet);
    event PlatformFeeSettled(address indexed feeReceiver, uint256 amount);

    /// @dev Receives native ETH from ETHx.downgradeToETH() during settle(), before forwarding to RevNet.
    receive() external payable {}

    /// @dev Clone-safe reentrancy mutex. A fresh EIP-1167 clone leaves this 0 (treated as unlocked), so
    ///      it never depends on a constructor/initializer to arm. Guards the permissionless paths that
    ///      make external calls (settle's ETH sends / RevNet pays, deposit withdrawals, the flow pokes).
    uint256 private _reentrancyLock;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier nonReentrant() {
        require(_reentrancyLock != 2, "Reentrant call");
        _reentrancyLock = 2;
        _;
        _reentrancyLock = 1;
    }

    /// @param host_ Superfluid host (Base). @param ethx_ ETHx SuperToken (Base).
    constructor(ISuperfluid host_, ISuperToken ethx_) CFASuperAppBase(host_) {
        ETHX = ethx_;
    }

    // ─── Initializer (factory-called on the clone) ────────────────────────────

    function initialize(
        address _admin,
        address _beneficiaryAddress,
        string calldata _leaderboardName,
        address _markeeImplementation,
        uint256 _minimumMonthlyRate,
        uint256 _maxMessageLength,
        uint256 _maxNameLength,
        address _seedOwner
    ) external returns (address seedMarkeeAddress) {
        require(!initialized, "Already initialized");
        require(_admin != address(0), "Admin cannot be zero address");
        require(_markeeImplementation != address(0), "Markee implementation cannot be zero address");
        require(bytes(_leaderboardName).length > 0, "Name cannot be empty");
        require(_maxMessageLength > 0, "Max message length must be > 0");
        require(_maxNameLength > 0, "Max name length must be > 0");
        require(_seedOwner != address(0), "Seed owner cannot be zero address");

        initialized = true;
        factory = msg.sender;
        admin = _admin;
        beneficiaryAddress = _beneficiaryAddress;
        leaderboardName = _leaderboardName;
        markeeImplementation = _markeeImplementation;
        minimumMonthlyRate = _minimumMonthlyRate;
        maxMessageLength = _maxMessageLength;
        maxNameLength = _maxNameLength;

        seedMarkeeAddress = _deploySeedMarkee(_seedOwner);
    }

    // ─── IPricingStrategy proxies → factory (Coop multisig updates all clones at once) ──

    function revNetEnabled() external view override returns (bool) {
        return ILeaderboardFactory(factory).revNetEnabled();
    }

    function percentToBeneficiary() public view override returns (uint256) {
        return ILeaderboardFactory(factory).percentToBeneficiary();
    }

    function revNetTerminal() external view override returns (address) {
        return ILeaderboardFactory(factory).revNetTerminal();
    }

    function revNetProjectId() external view override returns (uint256) {
        return ILeaderboardFactory(factory).revNetProjectId();
    }

    function platformFeeReceiver() external view override returns (address) {
        return ILeaderboardFactory(factory).platformFeeReceiver();
    }

    function percentToPlatformFeeReceiver() external view override returns (uint256) {
        return ILeaderboardFactory(factory).percentToPlatformFeeReceiver();
    }

    // ─── Markee creation / migration-in ───────────────────────────────────────

    /// @notice Creates a new Markee + its GDA refund pool. Backing happens by streaming (no payment here).
    function createMarkee(string calldata _message, string calldata _name)
        external
        returns (address markeeAddress)
    {
        require(initialized, "Not initialized");
        require(bytes(_message).length <= maxMessageLength, "Message too long");
        require(bytes(_name).length <= maxNameLength, "Name too long");

        markeeAddress = _clone(markeeImplementation);
        Markee(markeeAddress).initialize(msg.sender, address(this), _message, _name, 0);
        _registerMarkee(markeeAddress);
        emit MarkeeCreated(markeeAddress, msg.sender, _message, _name);
    }

    /// @notice Registers already-existing Markees (in-place migration), creating a pool for each.
    /// @dev Mirrors v1.3 Leaderboard.initializeHistory. The Markee addresses (and KV view/reaction
    ///      continuity) are preserved — migrate via the legacy Leaderboard's migratePricingStrategy first.
    function registerExistingMarkees(address[] calldata _markees) external onlyAdmin {
        for (uint256 i = 0; i < _markees.length; i++) {
            address m = _markees[i];
            if (m != address(0) && !isMarkeeOnLeaderboard[m]) {
                require(Markee(m).pricingStrategy() == address(this), "Markee not migrated to this strategy");
                _registerMarkee(m);
            }
        }
    }

    // ─── Deposits (refundable buffer cover for refund flows) ───────────────────

    /// @notice Backer pre-posts an ETHx deposit covering its refund-flow buffer share. Must be done
    ///         (and approved) before opening the inbound stream; the frontend bundles it into one tx.
    function depositBuffer(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero deposit");
        require(IERC20(address(ETHX)).transferFrom(msg.sender, address(this), amount), "Deposit transfer failed");
        backerDeposit[msg.sender] += amount;
        emit DepositAdded(msg.sender, amount, backerDeposit[msg.sender]);
    }

    /// @notice Reclaim a deposit once the backer has no active stream.
    function withdrawDeposit() external nonReentrant {
        require(backerMarkee[msg.sender] == address(0), "Still streaming");
        uint256 amount = backerDeposit[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        backerDeposit[msg.sender] = 0;
        require(IERC20(address(ETHX)).transfer(msg.sender, amount), "Withdraw transfer failed");
        emit DepositWithdrawn(msg.sender, amount);
    }

    // ─── Permissionless decay poke (promotions are automatic in the callback) ──

    /// @notice Flip #1 to `challenger` when it outbids the incumbent. O(1). Anyone may call — the
    ///         incentivized rival, the frontend, or a cron. Promotions need no poke (they flip in the
    ///         inflow callback); this only heals the decay direction, where the incumbent's drop fires
    ///         no callback for the rising rival.
    function claimTop(address challenger) external nonReentrant {
        require(isMarkeeOnLeaderboard[challenger], "Unknown markee");
        require(challenger != topMarkee, "Already top");
        require(aggregateRate[challenger] > topRate, "Not higher than top");

        _accrueTop();
        address oldTop = topMarkee;
        _setTop(challenger);

        _setRefund(challenger, 0);
        if (oldTop != address(0)) {
            _setRefund(oldTop, aggregateRate[oldTop]);
        }
        _setBeneficiaryFlow(_beneficiaryTarget());
    }

    /// @notice Permissionless poke that realigns a Markee's outbound flow with its current aggregate.
    ///         The not-allowed-to-revert termination callback defers any flow op that would need fresh
    ///         buffer (a beneficiary re-create, or a refund raise); this restores the correct rate. A
    ///         no-op in the normal case, so it is always safe to call.
    function syncMarkee(address markee) external nonReentrant {
        require(isMarkeeOnLeaderboard[markee], "Unknown markee");
        _accrueTop();
        if (markee == topMarkee) {
            topRate = aggregateRate[markee];
            _setBeneficiaryFlow(_beneficiaryTarget());
        } else {
            _setRefund(markee, aggregateRate[markee]);
        }
    }

    // ─── Per-funder RevNet settlement ──────────────────────────────────────────

    /// @notice Settle the accrued RevNet share owed to each given backer: convert the owed ETHx to
    ///         native ETH and route it through the Markee Cooperative RevNet with the backer as the
    ///         token recipient. Permissionless — anyone (a backer, the frontend, a cron) may settle
    ///         any set of backers; funds always flow to the rightful backer, never the caller.
    /// @dev Mirrors v1.3 Markee `_routeRevNet`: the platform fee (percentToPlatformFeeReceiver) is
    ///      taken from the RevNet bucket — here aggregated into one pay() to the fee receiver — and
    ///      the remainder is paid per backer as their RevNet contribution. Active (still-streaming)
    ///      backers are first brought current via the accumulator without disturbing their units.
    function settle(address[] calldata backers) external nonReentrant {
        _accrueTop();

        uint256 n = backers.length;
        uint256[] memory amounts = new uint256[](n);
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            address backer = backers[i];
            _realizeCurrent(backer);
            uint256 amt = claimable[backer];
            if (amt > 0) {
                claimable[backer] = 0;
                amounts[i] = amt;
                total += amt;
            }
        }
        if (total == 0) return;

        _routeRevNetSettlement(backers, amounts, total);
    }

    /// @notice Live (unsettled) ETHx owed to a backer, including accrual up to the current block.
    /// @dev View helper for the frontend / tests — does not mutate state.
    function pendingSettlement(address backer) external view returns (uint256) {
        uint256 owed = claimable[backer];
        address m = backerMarkee[backer];
        if (m == address(0)) return owed;

        uint256 acc = accRevNetPerUnit[m];
        if (m == topMarkee && topRate > 0 && aggregateRate[m] > 0) {
            uint256 dt = block.timestamp - lastAccrualTime;
            uint256 revNetBps = BASIS_POINTS_DIVISOR - percentToBeneficiary();
            uint256 accrued = (topRate * dt * revNetBps) / BASIS_POINTS_DIVISOR;
            acc += (accrued * PRECISION) / aggregateRate[m];
        }
        uint256 units = uint256(poolOf[m].getUnits(backer));
        uint256 accumulated = (units * acc) / PRECISION;
        uint256 debt = backerRewardDebt[backer];
        return owed + (accumulated > debt ? accumulated - debt : 0);
    }

    // ─── Migration-out / free edits / admin ───────────────────────────────────

    /// @notice Move a Markee to a new pricing strategy. Winds down its refund flow + pool units; its
    ///         backers reclaim deposits and close their own streams lazily (O(1) each).
    function migratePricingStrategy(address _markee, address _newStrategy) external onlyAdmin {
        require(isMarkeeOnLeaderboard[_markee], "Markee not on this leaderboard");
        require(_newStrategy != address(0), "Strategy cannot be zero address");
        _accrueTop();
        if (refundRate[_markee] > 0) _setRefund(_markee, 0);
        _vacateTopIf(_markee);
        _unregisterMarkee(_markee);
        Markee(_markee).setPricingStrategy(_newStrategy);
        emit MarkeeLeft(_markee);
    }

    /// @notice Remove a Markee that already switched strategy elsewhere.
    function markeeLeft(address _markee) external {
        require(isMarkeeOnLeaderboard[_markee], "Markee not on this leaderboard");
        require(Markee(_markee).pricingStrategy() != address(this), "Markee still on this leaderboard");
        _accrueTop();
        if (refundRate[_markee] > 0) _setRefund(_markee, 0);
        _vacateTopIf(_markee);
        _unregisterMarkee(_markee);
        emit MarkeeLeft(_markee);
    }

    function updateMessage(address _markee, string calldata _newMessage) external {
        require(isMarkeeOnLeaderboard[_markee], "Markee not on this leaderboard");
        require(msg.sender == Markee(_markee).owner(), "Only Markee owner");
        require(bytes(_newMessage).length <= maxMessageLength, "Message too long");
        Markee(_markee).setMessage(_newMessage);
        emit MessageUpdated(_markee, msg.sender, _newMessage);
    }

    function updateName(address _markee, string calldata _newName) external {
        require(isMarkeeOnLeaderboard[_markee], "Markee not on this leaderboard");
        require(msg.sender == Markee(_markee).owner(), "Only Markee owner");
        require(bytes(_newName).length <= maxNameLength, "Name too long");
        Markee(_markee).setName(_newName);
        emit NameUpdated(_markee, msg.sender, _newName);
    }

    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        emit AdminChanged(admin, _newAdmin);
        admin = _newAdmin;
    }

    /// @dev Migrates the live beneficiary stream: closes the outflow to the old beneficiary (otherwise
    ///      it would keep draining the contract forever and break buffer accounting) and opens the
    ///      stream to the new one at the current 62%-of-top rate.
    function setBeneficiaryAddress(address _newBeneficiary) external onlyAdmin {
        address old = beneficiaryAddress;
        if (old != address(0) && ETHX.getCFAFlowRate(address(this), old) > 0) {
            ETHX.deleteFlow(address(this), old);
        }
        emit BeneficiaryChanged(old, _newBeneficiary);
        beneficiaryAddress = _newBeneficiary;
        _setBeneficiaryFlow(_beneficiaryTarget());
    }

    function setMinimumMonthlyRate(uint256 _newRate) external onlyAdmin {
        emit MinimumMonthlyRateChanged(minimumMonthlyRate, _newRate);
        minimumMonthlyRate = _newRate;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function markeeCount() external view returns (uint256) {
        return markees.length;
    }

    function getMarkees(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 end = offset + limit;
        if (end > markees.length) end = markees.length;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = markees[i];
        }
    }

    function isAcceptedSuperToken(ISuperToken superToken) public view override returns (bool) {
        return address(superToken) == address(ETHX);
    }

    // ─── SuperApp CFA callbacks (via CFASuperAppBase hooks) ────────────────────

    /// @dev A new inbound stream. userData tags the target Markee. Reverts (safe — non-termination)
    ///      if the Markee is unknown, the deposit is insufficient, or the rate is below the minimum.
    function onFlowCreated(ISuperToken, address sender, int96 flowRate, bytes calldata ctx)
        internal
        override
        returns (bytes memory newCtx)
    {
        address markee = abi.decode(HOST.decodeCtx(ctx).userData, (address));
        require(isMarkeeOnLeaderboard[markee], "Unknown markee");
        uint256 rate = uint256(uint96(flowRate));
        require(rate * SECONDS_IN_MONTH >= minimumMonthlyRate, "Below minimum monthly rate");
        require(backerDeposit[sender] >= rate * BUFFER_PERIOD, "Insufficient deposit");

        _accrueTop();
        backerMarkee[sender] = markee;
        aggregateRate[markee] += rate;
        poolOf[markee].updateMemberUnits(sender, uint128(rate));
        _moveUnits(sender, markee, 0, rate);
        emit BackerUpdated(sender, markee, rate, aggregateRate[markee]);

        newCtx = _applyRankingWithCtx(markee, ctx);
    }

    /// @dev An existing backer changed its rate.
    function onFlowUpdated(
        ISuperToken,
        address sender,
        int96 flowRate,
        int96 previousFlowRate,
        uint256,
        bytes calldata ctx
    ) internal override returns (bytes memory newCtx) {
        address markee = backerMarkee[sender];
        if (markee == address(0)) return ctx;

        uint256 newRate = uint256(uint96(flowRate));
        uint256 oldRate = uint256(uint96(previousFlowRate));
        require(backerDeposit[sender] >= newRate * BUFFER_PERIOD, "Insufficient deposit");
        _accrueTop();
        aggregateRate[markee] = aggregateRate[markee] - oldRate + newRate;
        poolOf[markee].updateMemberUnits(sender, uint128(newRate));
        _moveUnits(sender, markee, oldRate, newRate);
        emit BackerUpdated(sender, markee, newRate, aggregateRate[markee]);

        newCtx = _applyRankingWithCtx(markee, ctx);
    }

    /// @dev A backer closed its stream (or was liquidated). MUST NOT revert (jail-safe): all work is
    ///      storage + bounded flow updates; the incumbent's decay does not search for a new top
    ///      (a rival promotes itself via claimTop).
    function onInFlowDeleted(ISuperToken, address sender, int96 previousFlowRate, uint256, bytes calldata ctx)
        internal
        override
        returns (bytes memory newCtx)
    {
        newCtx = ctx;
        address markee = backerMarkee[sender];
        if (markee == address(0)) return newCtx;

        uint256 oldRate = uint256(uint96(previousFlowRate));
        _accrueTop();
        if (aggregateRate[markee] >= oldRate) {
            aggregateRate[markee] -= oldRate;
        } else {
            aggregateRate[markee] = 0;
        }
        poolOf[markee].updateMemberUnits(sender, 0);
        _moveUnits(sender, markee, oldRate, 0);
        backerMarkee[sender] = address(0);
        emit BackerUpdated(sender, markee, 0, aggregateRate[markee]);

        if (markee == topMarkee) {
            topRate = aggregateRate[markee];
            newCtx = _setBeneficiaryFlowWithCtx(_beneficiaryTarget(), false, newCtx);
        } else {
            newCtx = _setRefundWithCtx(markee, aggregateRate[markee], true, newCtx);
        }
    }

    // ─── Ranking core ─────────────────────────────────────────────────────────

    /// @dev Apply promotion/refund after an inbound create/update, threading ctx.
    function _applyRankingWithCtx(address markee, bytes memory ctx) internal returns (bytes memory newCtx) {
        newCtx = ctx;
        uint256 agg = aggregateRate[markee];

        if (markee == topMarkee) {
            topRate = agg;
            newCtx = _setBeneficiaryFlowWithCtx(_beneficiaryTarget(), true, newCtx);
        } else if (agg > topRate) {
            address oldTop = topMarkee;
            _setTop(markee);
            newCtx = _setRefundWithCtx(markee, 0, false, newCtx);
            if (oldTop != address(0)) {
                newCtx = _setRefundWithCtx(oldTop, aggregateRate[oldTop], false, newCtx);
            }
            newCtx = _setBeneficiaryFlowWithCtx(_beneficiaryTarget(), true, newCtx);
        } else {
            newCtx = _setRefundWithCtx(markee, agg, false, newCtx);
        }
    }

    function _setTop(address markee) internal {
        emit TopChanged(topMarkee, markee, aggregateRate[markee]);
        topMarkee = markee;
        topRate = aggregateRate[markee];
    }

    function _beneficiaryTarget() internal view returns (uint256) {
        if (beneficiaryAddress == address(0)) return 0;
        return (topRate * percentToBeneficiary()) / BASIS_POINTS_DIVISOR;
    }

    // ─── Settlement accrual (MasterChef-style, jail-safe storage math) ─────────

    /// @dev Roll the current top Markee's per-unit accumulator forward to now. Must be called before
    ///      any change to topMarkee / topRate / a top backer's units. Pure storage + a trusted-view
    ///      factory read (no revert), so it is safe inside the termination callback.
    function _accrueTop() internal {
        address t = topMarkee;
        uint256 last = lastAccrualTime;
        lastAccrualTime = block.timestamp;
        if (t == address(0) || last == 0) return;
        uint256 units = aggregateRate[t];
        if (units == 0) return;
        uint256 dt = block.timestamp - last;
        if (dt == 0) return;
        uint256 revNetBps = BASIS_POINTS_DIVISOR - percentToBeneficiary();
        uint256 accrued = (topRate * dt * revNetBps) / BASIS_POINTS_DIVISOR;
        accRevNetPerUnit[t] += (accrued * PRECISION) / units;
    }

    /// @dev Realize a backer's pending reward at its OLD units, then reset its debt to NEW units.
    ///      Call after _accrueTop and after the pool units have been updated. `markee` is passed in
    ///      (not read from backerMarkee) so it works while backerMarkee is being cleared on deletion.
    function _moveUnits(address backer, address markee, uint256 oldUnits, uint256 newUnits) internal {
        uint256 acc = accRevNetPerUnit[markee];
        uint256 accumulated = (oldUnits * acc) / PRECISION;
        uint256 debt = backerRewardDebt[backer];
        if (accumulated > debt) {
            claimable[backer] += accumulated - debt;
        }
        backerRewardDebt[backer] = (newUnits * acc) / PRECISION;
    }

    /// @dev Bring an active backer current (realize pending without changing its units) ahead of a
    ///      settlement. No-op for a backer with no live stream — their claimable is already final.
    function _realizeCurrent(address backer) internal {
        address m = backerMarkee[backer];
        if (m == address(0)) return;
        uint256 units = uint256(poolOf[m].getUnits(backer));
        _moveUnits(backer, m, units, units);
    }

    /// @dev If `markee` is the current #1, vacate the top (no auto-promotion) and stop the beneficiary
    ///      stream. Used when a Markee leaves the leaderboard so the accumulator stops crediting it.
    function _vacateTopIf(address markee) internal {
        if (markee != topMarkee) return;
        topMarkee = address(0);
        topRate = 0;
        _setBeneficiaryFlow(0);
    }

    /// @dev downgrade the owed ETHx to native ETH and route per backer through the RevNet, mirroring
    ///      v1.3 Markee `_routeRevNet`. The platform fee is aggregated into a single pay() to the fee
    ///      receiver; each backer's remainder is paid with the backer as token recipient.
    function _routeRevNetSettlement(address[] calldata backers, uint256[] memory amounts, uint256 total)
        internal
    {
        ISETH(address(ETHX)).downgradeToETH(total);

        if (!ILeaderboardFactory(factory).revNetEnabled()) {
            for (uint256 i = 0; i < amounts.length; i++) {
                if (amounts[i] > 0) {
                    (bool ok,) = backers[i].call{value: amounts[i]}("");
                    require(ok, "ETH transfer failed");
                    emit Settled(backers[i], amounts[i], false);
                }
            }
            return;
        }

        uint256 totalFee = _payBackersViaRevNet(backers, amounts);
        if (totalFee > 0) {
            address feeReceiver = ILeaderboardFactory(factory).platformFeeReceiver();
            _revNetPay(feeReceiver, totalFee);
            emit PlatformFeeSettled(feeReceiver, totalFee);
        }
    }

    /// @dev Pay each backer's RevNet remainder (net of the platform fee) with the backer as token
    ///      recipient; return the aggregated platform fee for a single downstream pay().
    function _payBackersViaRevNet(address[] calldata backers, uint256[] memory amounts)
        internal
        returns (uint256 totalFee)
    {
        ILeaderboardFactory f = ILeaderboardFactory(factory);
        uint256 feePct = f.platformFeeReceiver() == address(0) ? 0 : f.percentToPlatformFeeReceiver();

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 amt = amounts[i];
            if (amt == 0) continue;
            uint256 fee = (amt * feePct) / BASIS_POINTS_DIVISOR;
            totalFee += fee;
            uint256 buyerAmount = amt - fee;
            if (buyerAmount > 0) {
                _revNetPay(backers[i], buyerAmount);
            }
            emit Settled(backers[i], amt, true);
        }
    }

    /// @dev One native-ETH RevNet contribution with `recipient` as the token recipient (isolated in
    ///      its own frame so the 7-arg pay() call does not blow the stack of its caller).
    function _revNetPay(address recipient, uint256 amount) internal {
        ILeaderboardFactory f = ILeaderboardFactory(factory);
        IJBMultiTerminal(f.revNetTerminal()).pay{value: amount}(
            f.revNetProjectId(), NATIVE_TOKEN, amount, recipient, 0, "", ""
        );
    }

    // ─── Flow helpers (ctx variants for callbacks, plain variants for external calls) ──

    /// @param onlyLower when true (the no-revert termination path), a rate increase is skipped rather
    ///        than applied — raising a distributeFlow needs buffer and could revert → jail. The raise
    ///        is deferred to the permissionless `syncMarkee` poke.
    function _setRefundWithCtx(address markee, uint256 rate, bool onlyLower, bytes memory ctx)
        internal
        returns (bytes memory newCtx)
    {
        newCtx = ctx;
        if (refundRate[markee] == rate) return newCtx;
        if (onlyLower && rate > refundRate[markee]) return newCtx;
        refundRate[markee] = rate;
        newCtx = ETHX.distributeFlowWithCtx(address(this), poolOf[markee], _toInt96(rate), newCtx);
    }

    function _setRefund(address markee, uint256 rate) internal {
        if (refundRate[markee] == rate) return;
        refundRate[markee] = rate;
        ETHX.distributeFlow(poolOf[markee], _toInt96(rate));
    }

    /// @param allowCreate when false (the no-revert termination path), creating a fresh beneficiary
    ///        stream is skipped — a create needs buffer and could revert → jail. This only matters if
    ///        the beneficiary previously force-closed the contract's outflow; the stream is restored by
    ///        the permissionless `syncMarkee` poke.
    function _setBeneficiaryFlowWithCtx(uint256 target, bool allowCreate, bytes memory ctx)
        internal
        returns (bytes memory newCtx)
    {
        newCtx = ctx;
        if (beneficiaryAddress == address(0)) return newCtx;
        int96 current = ETHX.getCFAFlowRate(address(this), beneficiaryAddress);
        int96 t = _toInt96(target);
        if (t == current) return newCtx;
        if (current == 0) {
            if (!allowCreate) return newCtx;
            newCtx = ETHX.createFlowWithCtx(beneficiaryAddress, t, newCtx);
        } else if (t == 0) {
            newCtx = ETHX.deleteFlowWithCtx(address(this), beneficiaryAddress, newCtx);
        } else {
            newCtx = ETHX.updateFlowWithCtx(beneficiaryAddress, t, newCtx);
        }
    }

    function _setBeneficiaryFlow(uint256 target) internal {
        if (beneficiaryAddress == address(0)) return;
        int96 current = ETHX.getCFAFlowRate(address(this), beneficiaryAddress);
        int96 t = _toInt96(target);
        if (t == current) return;
        if (current == 0) {
            ETHX.createFlow(beneficiaryAddress, t);
        } else if (t == 0) {
            ETHX.deleteFlow(address(this), beneficiaryAddress);
        } else {
            ETHX.updateFlow(beneficiaryAddress, t);
        }
    }

    // ─── Internal registry / clone helpers ────────────────────────────────────

    function _deploySeedMarkee(address _owner) internal returns (address markeeAddress) {
        markeeAddress = _clone(markeeImplementation);
        Markee(markeeAddress).initialize(_owner, address(this), "", "", 0);
        _registerMarkee(markeeAddress);
    }

    function _registerMarkee(address markeeAddress) internal {
        markeeIndex[markeeAddress] = markees.length;
        markees.push(markeeAddress);
        isMarkeeOnLeaderboard[markeeAddress] = true;
        PoolConfig memory cfg =
            PoolConfig({ transferabilityForUnitsOwner: false, distributionFromAnyAddress: false });
        ISuperfluidPool pool = ETHX.createPool(address(this), cfg);
        poolOf[markeeAddress] = pool;
        emit MarkeeRegistered(markeeAddress, address(pool));
    }

    function _unregisterMarkee(address markeeAddress) internal {
        require(isMarkeeOnLeaderboard[markeeAddress], "Not in registry");
        uint256 index = markeeIndex[markeeAddress];
        address last = markees[markees.length - 1];
        markees[index] = last;
        markeeIndex[last] = index;
        markees.pop();
        delete markeeIndex[markeeAddress];
        isMarkeeOnLeaderboard[markeeAddress] = false;
    }

    function _toInt96(uint256 x) internal pure returns (int96) {
        require(x <= uint256(uint96(type(int96).max)), "Rate overflow");
        return int96(uint96(x));
    }

    function _clone(address implementation) internal returns (address instance) {
        assembly {
            mstore(0x00, or(
                shr(0xe8, shl(0x60, implementation)),
                0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000
            ))
            mstore(0x20, or(
                shl(0x78, implementation),
                0x5af43d82803e903d91602b57fd5bf3
            ))
            instance := create(0, 0x09, 0x37)
        }
        require(instance != address(0), "Clone deployment failed");
    }
}
