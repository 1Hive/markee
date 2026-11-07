// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// ─── Minimal external interfaces (self-contained: no Markee or Juicebox imports) ──────────────

/// @notice The subset of a Markee "For Rent" StreamingLeaderboard this forwarder reads and calls.
interface IMarkeeRentLeaderboard {
    function ETHX() external view returns (address);
    function beneficiaryAddress() external view returns (address);
    function percentToBeneficiary() external view returns (uint256);
    function topRate() external view returns (uint256);
    function platformFeeReceiver() external view returns (address);
    function pendingSettlement(address backer) external view returns (uint256);
    function settle(address[] calldata backers) external;
}

/// @notice Superfluid native-asset SuperToken (ETHx).
interface ISuperETH {
    function balanceOf(address account) external view returns (uint256);
    function realtimeBalanceOfNow(address account)
        external
        view
        returns (int256 availableBalance, uint256 deposit, uint256 owedDeposit, uint256 timestamp);
    function downgradeToETH(uint256 wad) external;
}

/// @notice Superfluid CFAv1Forwarder (only the flow-rate read).
interface ICFAForwarderMinimal {
    function getFlowrate(address token, address sender, address receiver) external view returns (int96);
}

/// @notice Juicebox v6 JBDirectory (only the terminal lookup).
interface IJBDirectoryMinimal {
    function primaryTerminalOf(uint256 projectId, address token) external view returns (address);
}

/// @notice Juicebox v6 terminal (IJBTerminal pay / addToBalanceOf).
interface IJBTerminalMinimal {
    function pay(
        uint256 projectId,
        address token,
        uint256 amount,
        address beneficiary,
        uint256 minReturnedTokens,
        string calldata memo,
        bytes calldata metadata
    ) external payable returns (uint256 beneficiaryTokenCount);

    function addToBalanceOf(
        uint256 projectId,
        address token,
        uint256 amount,
        bool shouldReturnHeldFees,
        string calldata memo,
        bytes calldata metadata
    ) external payable;
}

/// @title MarkeeJuiceboxForwarder (BETA)
/// @custom:status BETA. An experimental, unaudited integration published for other teams to build on.
///         It is not part of Markee's production product, Markee does not operate or support deployments
///         of it, and its interface may change. Use at your own risk.
/// @notice Lets a Markee "For Rent" sign pay its beneficiary share into a Juicebox v6 project, with the
///         project's tokens issued to the same backers who receive MARKEE for that rent.
///
/// @dev How it works
///      - Set this contract as the `beneficiaryAddress` of ONE Markee For Rent StreamingLeaderboard
///        (bound immutably at deployment). The leaderboard then streams the beneficiary share of the #1
///        sign's rent to this contract as ETHx.
///      - The leaderboard keeps a per-backer ledger of the MARKEE-side rent each backer has accrued
///        (`pendingSettlement`). It accrues that ledger from the rent it actually retains, i.e. the #1
///        sign's rate minus the live beneficiary stream, so each backer's share of the ETHx received here
///        is `settled × beneficiaryRate / (topRate − beneficiaryRate)`, read from the live streams (not
///        from the factory's percentage, which only reaches the streams at the board's next flow event).
///      - Anyone may call `sync(backers)`. For each backer it settles their MARKEE on the leaderboard
///        (exactly what Markee's own Claim button does), credits the matching beneficiary share, unwraps
///        it to ETH and pays the Juicebox project with that backer as the token beneficiary.
///      - Funds no backer can be credited for (e.g. rent claimed through Markee's own Claim button before
///        a sync) are not lost: `sweepSurplus` moves them into the project's balance (no tokens issued).
///        While attached it keeps back a reserve that covers every backer's unsynced rent, computed from
///        the leaderboard's own holdings, so the amount swept never depends on who calls it or with
///        which backers.
///      - Keeper: call `sync(backers)` daily and `sweepSurplus(backers)` weekly, with the board's backers
///        (from the leaderboard's `BackerUpdated` events).
///
/// @dev Trust model: no owner, no admin, no upgradability, all configuration immutable. Callers of
///      `sync` / `payOwed` / `sweepSurplus` choose only *when* things happen, never *where* funds go:
///      project funds always go to PROJECT_ID, and project tokens always go to the backer whose
///      leaderboard ledger produced the credit.
///
/// @dev Known limitations (see README):
///      - If a backer's rent is settled on the leaderboard by someone other than this contract (e.g. the
///        Markee Claim button) before a `sync`, that slice's project tokens can no longer be attributed.
///        It is never over-credited; its ETH reaches the project through `sweepSurplus`.
///      - While attached, a sweep keeps back `reserve()`, the share of everything the leaderboard holds
///        (including backers' buffer deposits). That standing reserve is swept once detached.
///      - If the share ratio changes (a factory percentage change reaching the streams) between two syncs
///        of a backer, that backer's rent from the interval is credited at the newer ratio. Credits never
///        exceed funds held; anything under-credited is swept to the project.
///      - Any address seen as the platform fee receiver is never credited (its leaderboard balance can
///        hold fees put back after a failed fee payment), even after the factory rotates the receiver.
///        A receiver that held the role only between two calls to this contract is not seen (no on-chain
///        state records past receivers). If one of its fee payments failed meanwhile, a sync of it can be
///        credited up to that fee's share: project tokens for a slice an external settle had already
///        stranded. No backer is under-credited and the ETH still goes only to the project.
///      - Credits assume this contract was the leaderboard's beneficiary for the whole period being
///        settled. When attaching to a sign that already has backers, settle all of them in the same
///        transaction that sets this contract as beneficiary.
///      - Plain ETH transfers are rejected, so this contract cannot be (mis)used as a For Sale beneficiary:
///        that purchase reverts with `DirectEthNotAccepted` instead of silently issuing no tokens.
contract MarkeeJuiceboxForwarder {
    /// @notice Release label. BETA: experimental, unaudited, not part of Markee's production product.
    string public constant VERSION = "0.3.0-beta";
    /// @notice Juicebox's native-token sentinel (ETH).
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    /// @notice Gas each backer's settle + credit + pay runs with, in isolation. Well above an honest
    ///         backer's needs (~1M), so a backer that fails within it is skipped instead of reverting the
    ///         whole batch. A sync must be sent with at least this much gas available per backer.
    uint256 public constant BACKER_GAS = 5_000_000;
    /// @dev Gas kept back for the loop itself after a backer's isolated call returns.
    uint256 private constant GAS_RESERVE = 60_000;
    uint256 private constant BPS = 10_000;
    /// @notice Superfluid's CFAv1Forwarder (same address on every Superfluid network), used to read the
    ///         live beneficiary stream rate.
    ICFAForwarderMinimal public constant CFA_FORWARDER =
        ICFAForwarderMinimal(0xcfA132E353cB4E398080B9700609bb008eceB125);

    /// @notice Juicebox v6 JBDirectory used to resolve the project's ETH terminal at pay time.
    IJBDirectoryMinimal public immutable DIRECTORY;
    /// @notice The Markee For Rent leaderboard whose beneficiary stream this contract forwards.
    IMarkeeRentLeaderboard public immutable LEADERBOARD;
    /// @notice ETHx, read from the leaderboard at deployment.
    ISuperETH public immutable ETHX;
    /// @notice The Juicebox project that receives the funds and issues tokens to backers.
    uint256 public immutable PROJECT_ID;
    /// @notice Memo attached to every Juicebox payment (set once at deployment).
    string public memo;

    /// @notice Native-ETH amount credited to a backer but not yet paid into the project.
    mapping(address => uint256) public owedOf;
    /// @notice Sum of all `owedOf`.
    uint256 public totalOwed;
    /// @notice Last observed share ratio (beneficiary rate : retained rate). Used when the live ratio is
    ///         undefined (no #1 sign); starts at the factory percentage.
    uint256 public ratioNum;
    uint256 public ratioDen;
    /// @notice Addresses this contract has seen as the platform fee receiver; never credited.
    mapping(address => bool) public isExcluded;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    event Credited(address indexed backer, uint256 settledRent, uint256 credit);
    event Paid(address indexed backer, uint256 amount, uint256 beneficiaryTokenCount);
    /// @notice `amount` is the ETH this attempt tried to pay, which can be less than the backer's full
    ///         credit when the forwarder holds less. The whole credit stays in `owedOf` for a retry.
    event PaymentFailed(address indexed backer, uint256 amount, bytes reason);
    event BackerSkipped(address indexed backer, bytes reason);
    event SurplusSwept(uint256 amount);
    event ShareRatioUpdated(uint256 beneficiaryRate, uint256 retainedRate);
    event BackerExcluded(address indexed account);

    error ZeroAddress();
    error ZeroProjectId();
    error DirectEthNotAccepted();
    error NotBeneficiary();
    error NoTerminal();
    error Reentrancy();
    error InsufficientGas();
    error OnlySelf();

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @param directory Juicebox v6 JBDirectory (Base: 0x5aff29060e023e6fb87be5596652b33c65af535b).
    /// @param leaderboard The Markee For Rent StreamingLeaderboard this contract will be beneficiary of.
    /// @param projectId The Juicebox project to pay.
    /// @param memo_ Memo attached to each Juicebox payment.
    constructor(address directory, address leaderboard, uint256 projectId, string memory memo_) {
        if (directory == address(0) || leaderboard == address(0)) revert ZeroAddress();
        if (projectId == 0) revert ZeroProjectId();
        address ethx = IMarkeeRentLeaderboard(leaderboard).ETHX();
        if (ethx == address(0)) revert ZeroAddress();

        DIRECTORY = IJBDirectoryMinimal(directory);
        LEADERBOARD = IMarkeeRentLeaderboard(leaderboard);
        ETHX = ISuperETH(ethx);
        PROJECT_ID = projectId;
        memo = memo_;

        uint256 pct = IMarkeeRentLeaderboard(leaderboard).percentToBeneficiary();
        (ratioNum, ratioDen) = pct < BPS ? (pct, BPS - pct) : (0, 1);
        _noteFeeReceiver();
    }

    /// @dev Accepts ETH only from ETHx (unwrapping, which forwards just 2300 gas, so that branch must stay
    ///      first and storage-free) or while this contract is mid-operation (a terminal returning ETH).
    ///      Everything else, notably a For Sale Markee paying its beneficiary, is rejected.
    receive() external payable {
        if (msg.sender == address(ETHX)) return;
        if (_status == _ENTERED) return;
        revert DirectEthNotAccepted();
    }

    // ─── Permissionless actions ─────────────────────────────────────────────────

    /// @notice Settle each backer's MARKEE on the leaderboard, credit their matching beneficiary share,
    ///         and pay it into the Juicebox project with them as the token beneficiary.
    /// @dev Permissionless. Requires this contract to currently be the leaderboard's beneficiary.
    ///      Each backer runs in its own call with BACKER_GAS: if it fails (e.g. a backer contract that
    ///      burns gas when the leaderboard pays it), everything for that backer is rolled back, including
    ///      the leaderboard settle, and the backer is skipped with `BackerSkipped`; the rest still sync.
    ///      Each backer is credited with exactly what the leaderboard settled (pending before minus
    ///      pending after), so duplicates, zero balances and failed MARKEE payouts (which the leaderboard
    ///      restores) can never be double-credited.
    function sync(address[] calldata backers) external nonReentrant {
        if (LEADERBOARD.beneficiaryAddress() != address(this)) revert NotBeneficiary();
        _processAll(backers, true);
    }

    /// @notice Retry paying backers who already have an outstanding credit (e.g. after a failed
    ///         payment). Works even if this contract is no longer the beneficiary.
    function payOwed(address[] calldata backers) external nonReentrant {
        _processAll(backers, false);
    }

    /// @notice Move funds no backer can be credited for into the project's balance (no tokens issued).
    /// @dev While this contract is the beneficiary: first syncs `backers` (optional; it only makes the sweep
    ///      larger by crediting them first), then sweeps what is unallocated beyond `reserve()`. The reserve
    ///      is the share of everything the leaderboard holds, which bounds the unsynced rent of every
    ///      backer, listed or not. So the amount swept never depends on the caller or their list, and a
    ///      sweep can never take rent a later sync would credit. Callable any time; anything still held
    ///      back is swept by a later call once synced.
    ///      Once detached, nothing more can be attributed, so all unallocated funds are swept (`backers` is
    ///      ignored).
    /// @return swept Amount added to the project's balance.
    function sweepSurplus(address[] calldata backers) external nonReentrant returns (uint256 swept) {
        if (LEADERBOARD.beneficiaryAddress() == address(this)) {
            _processAll(backers, true);
            swept = _sweepable();
        } else {
            swept = _unallocated();
        }

        if (swept > 0) {
            _ensureEth(swept);
            address terminal = _terminal();
            if (terminal == address(0)) revert NoTerminal();
            IJBTerminalMinimal(terminal).addToBalanceOf{value: swept}(PROJECT_ID, NATIVE_TOKEN, swept, false, memo, "");
            emit SurplusSwept(swept);
        }
    }

    /// @notice Internal step, not part of the public API: one backer's settle + credit + pay, in its own
    ///         call frame so a failure only affects that backer.
    /// @dev External only so `_processAll` can try/catch it with a gas limit.
    /// @custom:access Only this contract, during `sync` / `payOwed` / `sweepSurplus`. Reverts with
    ///         `OnlySelf` for every other caller.
    function processBacker(address backer, uint256 num, uint256 den, uint256 free, bool settle)
        external
        returns (uint256 credit)
    {
        if (msg.sender != address(this) || _status != _ENTERED) revert OnlySelf();

        // A platform fee receiver's leaderboard balance can include fees the leaderboard put back after a
        // failed fee payment; the backers who paid that rent were already credited in full.
        if (settle && !isExcluded[backer]) {
            uint256 before = LEADERBOARD.pendingSettlement(backer);
            if (before > 0) {
                address[] memory one = new address[](1);
                one[0] = backer;
                uint256 gasBeforeSettle = gasleft();
                LEADERBOARD.settle(one);
                uint256 remaining = LEADERBOARD.pendingSettlement(backer);
                uint256 settled = remaining < before ? before - remaining : 0;
                // The leaderboard try/catches each MARKEE payout and restores the balance on failure. If
                // nothing settled and nearly all gas is gone, that payout ran out of gas: fail this backer
                // rather than "succeed" while settling nothing.
                if (settled == 0 && gasleft() < gasBeforeSettle / 16) revert InsufficientGas();
                credit = _share(settled, num, den);
                if (credit > free) credit = free;
                if (credit > 0) {
                    owedOf[backer] += credit;
                    totalOwed += credit;
                    emit Credited(backer, settled, credit);
                }
            }
        }
        _pay(backer);
    }

    // ─── Views ──────────────────────────────────────────────────────────────────

    /// @notice Estimate of what a `sync` of this backer alone would credit right now, plus anything already
    ///         owed. Each backer's estimate is capped by all unallocated funds, so estimates for several
    ///         backers can add up to more than one sync of all of them would credit.
    function pendingCredit(address backer) external view returns (uint256) {
        uint256 credit = 0;
        if (!isExcluded[backer] && backer != LEADERBOARD.platformFeeReceiver()) {
            (uint256 num, uint256 den) = _ratio();
            credit = _share(LEADERBOARD.pendingSettlement(backer), num, den);
        }
        uint256 free = _unallocated();
        return owedOf[backer] + (credit < free ? credit : free);
    }

    /// @notice Funds held (ETH + ETHx) that are not owed to any backer: stream not yet synced, slices
    ///         stranded by external settles, and rounding dust.
    function unallocated() external view returns (uint256) {
        return _unallocated();
    }

    /// @notice What `sweepSurplus` would move to the project right now, before syncing any backers.
    function sweepable() external view returns (uint256) {
        if (LEADERBOARD.beneficiaryAddress() != address(this)) return _unallocated();
        return _sweepable();
    }

    /// @notice Funds an attached sweep keeps back for backers' unsynced rent: the share of everything the
    ///         leaderboard holds (ETHx including its stream deposits, plus ETH). Every backer's unsettled
    ///         rent is held there, so this bounds what future syncs can still credit from rent already
    ///         accrued. It is deliberately generous (it also covers backers' buffer deposits).
    function reserve() external view returns (uint256) {
        return _reserve();
    }

    /// @notice The beneficiary-side share that corresponds to `settledRent` of MARKEE-side rent, at the
    ///         current share ratio.
    function shareOf(uint256 settledRent) external view returns (uint256) {
        (uint256 num, uint256 den) = _ratio();
        return _share(settledRent, num, den);
    }

    /// @notice The share ratio a sync would use now: (beneficiary stream rate, rate the board retains).
    function shareRatio() external view returns (uint256 beneficiaryRate, uint256 retainedRate) {
        return _ratio();
    }

    // ─── Internals ──────────────────────────────────────────────────────────────

    function _processAll(address[] calldata backers, bool settle) internal {
        uint256 num;
        uint256 den;
        if (settle) {
            _noteFeeReceiver();
            (num, den) = _ratio();
            // Only a live, nonzero ratio is remembered: a paused beneficiary stream reads as zero, and
            // storing that would also zero the sweep reserve's fallback for rent accrued before the pause.
            if (num > 0 && (num != ratioNum || den != ratioDen)) {
                (ratioNum, ratioDen) = (num, den);
                emit ShareRatioUpdated(num, den);
            }
        }
        // Funds held that are not yet promised to anyone. Credits are capped by it, which keeps the
        // invariant totalOwed <= funds held (a share can overshoot the stream by rounding dust, or after a
        // ratio change between syncs). Payouts reduce held funds and totalOwed equally, so it only shrinks
        // by the credits made.
        uint256 free = settle ? _unallocated() : 0;

        for (uint256 i = 0; i < backers.length; i++) {
            address backer = backers[i];
            if (backer == address(0)) continue;
            // Every backer must get its full BACKER_GAS (the EVM forwards at most 63/64 of what is left).
            // A sync sent with less reverts here, so gas estimation is forced to cover it, and a failure
            // inside a backer's call can only come from that backer or the project, never the caller.
            if (gasleft() < (BACKER_GAS * 64) / 63 + GAS_RESERVE) revert InsufficientGas();
            try this.processBacker{gas: BACKER_GAS}(backer, num, den, free, settle) returns (uint256 credit) {
                free -= credit;
            } catch (bytes memory reason) {
                emit BackerSkipped(backer, reason);
            }
        }
    }

    function _sweepable() internal view returns (uint256) {
        uint256 free = _unallocated();
        uint256 kept = _reserve();
        return free > kept ? free - kept : 0;
    }

    function _reserve() internal view returns (uint256) {
        (int256 available, uint256 deposit,,) = ETHX.realtimeBalanceOfNow(address(LEADERBOARD));
        uint256 holdings = (available > 0 ? uint256(available) : 0) + deposit + address(LEADERBOARD).balance;
        (uint256 num, uint256 den) = _ratio();
        // A paused beneficiary stream reads as a zero ratio, but rent accrued earlier was priced at the last
        // ratio seen, so reserve at that one.
        if (num == 0) (num, den) = (ratioNum, ratioDen);
        if (den == 0) return holdings; // cannot price it: keep everything back
        return _share(holdings, num, den);
    }

    /// @dev Live share ratio from the streams: (beneficiary rate, top rate minus it), exactly what the
    ///      leaderboard's accrual uses. With no #1 sign nothing accrues and the live ratio is undefined, so
    ///      the last observed one is used.
    function _ratio() internal view returns (uint256 num, uint256 den) {
        uint256 top = LEADERBOARD.topRate();
        int96 flow = CFA_FORWARDER.getFlowrate(address(ETHX), address(LEADERBOARD), address(this));
        uint256 ben = flow > 0 ? uint256(uint96(flow)) : 0;
        if (top > ben) return (ben, top - ben);
        return (ratioNum, ratioDen);
    }

    /// @dev Remembers the current platform fee receiver so it stays excluded after a rotation.
    function _noteFeeReceiver() internal {
        address receiver = LEADERBOARD.platformFeeReceiver();
        if (receiver != address(0) && !isExcluded[receiver]) {
            isExcluded[receiver] = true;
            emit BackerExcluded(receiver);
        }
    }

    function _unallocated() internal view returns (uint256) {
        uint256 held = address(this).balance + ETHX.balanceOf(address(this));
        return held > totalOwed ? held - totalOwed : 0;
    }

    function _share(uint256 settledRent, uint256 num, uint256 den) internal pure returns (uint256) {
        if (num == 0 || den == 0) return 0;
        return (settledRent * num) / den;
    }

    /// @dev Pays as much of `backer`'s credit as the funds held allow. A terminal failure (e.g. a paused
    ///      project) keeps the credit owed for a later `sync` / `payOwed`; running out of gas inside the
    ///      terminal fails this backer's call instead.
    function _pay(address backer) internal {
        uint256 owed = owedOf[backer];
        if (owed == 0) return;

        uint256 amount = _ensureEth(owed);
        if (amount == 0) return;

        address terminal = _terminal();
        if (terminal == address(0)) {
            emit PaymentFailed(backer, amount, "");
            return;
        }

        uint256 balanceBefore = address(this).balance;
        uint256 gasBeforePay = gasleft();
        try IJBTerminalMinimal(terminal).pay{value: amount}(PROJECT_ID, NATIVE_TOKEN, amount, backer, 0, memo, "")
        returns (uint256 tokenCount) {
            // A terminal may hand part of the ETH back (e.g. a router refund); only what it kept counts.
            uint256 balanceAfter = address(this).balance;
            uint256 spent = balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0;
            if (spent > owed) spent = owed;
            owedOf[backer] = owed - spent;
            totalOwed -= spent;
            emit Paid(backer, spent, tokenCount);
        } catch (bytes memory reason) {
            // Out of gas inside the terminal leaves only the 1/64 the EVM withholds: fail this backer's
            // call rather than record a terminal failure.
            if (gasleft() < gasBeforePay / 32) revert InsufficientGas();
            emit PaymentFailed(backer, amount, reason);
        }
    }

    /// @dev Unwraps enough ETHx so the contract holds up to `wanted` native ETH; returns the ETH available
    ///      for this payment (min of wanted and what is held in total).
    function _ensureEth(uint256 wanted) internal returns (uint256 available) {
        uint256 ethBalance = address(this).balance;
        if (ethBalance < wanted) {
            uint256 ethxBalance = ETHX.balanceOf(address(this));
            uint256 need = wanted - ethBalance;
            uint256 unwrap = need < ethxBalance ? need : ethxBalance;
            if (unwrap > 0) {
                ETHX.downgradeToETH(unwrap);
                ethBalance += unwrap;
            }
        }
        available = wanted < ethBalance ? wanted : ethBalance;
    }

    function _terminal() internal view returns (address terminal) {
        try DIRECTORY.primaryTerminalOf(PROJECT_ID, NATIVE_TOKEN) returns (address t) {
            terminal = t;
        } catch {}
    }
}
