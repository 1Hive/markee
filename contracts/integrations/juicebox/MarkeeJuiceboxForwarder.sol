// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// ─── Minimal external interfaces (self-contained: no Markee or Juicebox imports) ──────────────

/// @notice The subset of a Markee "For Rent" StreamingLeaderboard this forwarder reads and calls.
interface IMarkeeRentLeaderboard {
    function ETHX() external view returns (address);
    function beneficiaryAddress() external view returns (address);
    function percentToBeneficiary() external view returns (uint256);
    function platformFeeReceiver() external view returns (address);
    function pendingSettlement(address backer) external view returns (uint256);
    function settle(address[] calldata backers) external;
}

/// @notice Superfluid native-asset SuperToken (ETHx).
interface ISuperETH {
    function balanceOf(address account) external view returns (uint256);
    function downgradeToETH(uint256 wad) external;
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

/// @title MarkeeJuiceboxForwarder
/// @notice Lets a Markee "For Rent" sign pay its beneficiary share into a Juicebox v6 project, with the
///         project's tokens issued to the same backers who receive MARKEE for that rent.
///
/// @dev How it works
///      - Set this contract as the `beneficiaryAddress` of ONE Markee For Rent StreamingLeaderboard
///        (bound immutably at deployment). The leaderboard then streams the beneficiary share of the #1
///        sign's rent to this contract as ETHx.
///      - The leaderboard keeps a per-backer ledger of the MARKEE-side rent each backer has accrued
///        (`pendingSettlement`). The beneficiary stream and that MARKEE-side accrual are two fixed shares
///        of the same rent, so each backer's share of the ETHx received here is
///        `settled × percentToBeneficiary / (10000 − percentToBeneficiary)`.
///      - Anyone may call `sync(backers)`. For each backer it settles their MARKEE on the leaderboard
///        (exactly what Markee's own Claim button does), credits the matching beneficiary share, unwraps
///        it to ETH and pays the Juicebox project with that backer as the token beneficiary.
///      - Funds no backer can be credited for (e.g. rent claimed through Markee's own Claim button before
///        a sync) are not lost: `sweepSurplus` moves anything left unallocated for SWEEP_DELAY into the
///        project's balance (no tokens issued), while attached or after detaching.
///      - Keeper: call `sync(backers)` daily and `sweepSurplus(backers)` weekly, with every backer of the
///        board (from the leaderboard's `BackerUpdated` events).
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
///      - Rent must be synced within SWEEP_DELAY of accruing (a daily keeper is plenty); unsynced rent
///        older than that can be swept to the project without issuing tokens for it.
///      - Credits assume this contract was the leaderboard's beneficiary for the whole period being
///        settled. When attaching to a sign that already has backers, settle all of them in the same
///        transaction that sets this contract as beneficiary.
///      - Plain ETH transfers are rejected, so this contract cannot be (mis)used as a For Sale beneficiary:
///        that purchase reverts with `DirectEthNotAccepted` instead of silently issuing no tokens.
contract MarkeeJuiceboxForwarder {
    /// @notice Juicebox's native-token sentinel (ETH).
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    /// @notice How long funds must stay unallocated before `sweepSurplus` can move them to the project
    ///         while this contract is still the beneficiary.
    uint256 public constant SWEEP_DELAY = 7 days;
    /// @notice Gas each backer's settle + credit + pay runs with, in isolation. Well above an honest
    ///         backer's needs (~1M), so a backer that fails within it is skipped instead of reverting the
    ///         whole batch. A sync must be sent with at least this much gas available per backer.
    uint256 public constant BACKER_GAS = 5_000_000;
    /// @dev Gas kept back for the loop itself after a backer's isolated call returns.
    uint256 private constant GAS_RESERVE = 60_000;
    uint256 private constant BPS = 10_000;

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
    /// @notice Unallocated funds recorded by the last `sweepSurplus`, sweepable once SWEEP_DELAY passes.
    uint256 public sweepMarkAmount;
    /// @notice When that record was taken (0 = none yet).
    uint256 public sweepMarkTime;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    event Credited(address indexed backer, uint256 settledRent, uint256 credit);
    event Paid(address indexed backer, uint256 amount, uint256 beneficiaryTokenCount);
    event PaymentFailed(address indexed backer, uint256 amount, bytes reason);
    event BackerSkipped(address indexed backer, bytes reason);
    event SurplusSwept(uint256 amount);
    event SurplusMarked(uint256 amount, uint256 sweepableAt);

    error ZeroAddress();
    error ZeroProjectId();
    error DirectEthNotAccepted();
    error NotBeneficiary();
    error NoTerminal();
    error Reentrancy();
    error InsufficientGas();
    error OnlySelf();
    error SweepNotReady(uint256 sweepableAt);

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
    /// @dev While this contract is the beneficiary: first syncs `backers` (pass every backer of the board,
    ///      as for `sync`), so what is still unallocated afterwards is genuinely unattributable. Then, once
    ///      SWEEP_DELAY has passed since the previous call, sweeps the amount that call recorded as
    ///      unallocated, as far as it is still unallocated, and records the current unallocated amount for
    ///      the next sweep. The first call only records. Calling early reverts with `SweepNotReady` and does
    ///      not move the clock, so nobody can postpone a sweep. A caller who leaves backers out can at most
    ///      cost those backers project tokens for rent not synced within SWEEP_DELAY; the ETH still goes to
    ///      the project. Once detached, nothing more can be attributed, so all unallocated funds are swept
    ///      immediately (`backers` is ignored).
    /// @return swept Amount added to the project's balance.
    function sweepSurplus(address[] calldata backers) external nonReentrant returns (uint256 swept) {
        bool attached = LEADERBOARD.beneficiaryAddress() == address(this);

        if (!attached) {
            swept = _unallocated();
        } else {
            uint256 readyAt = sweepMarkTime == 0 ? 0 : sweepMarkTime + SWEEP_DELAY;
            if (block.timestamp < readyAt) revert SweepNotReady(readyAt);
            _processAll(backers, true);
            if (sweepMarkTime != 0) {
                uint256 free = _unallocated();
                swept = sweepMarkAmount < free ? sweepMarkAmount : free;
            }
        }

        if (swept > 0) {
            _ensureEth(swept);
            address terminal = _terminal();
            if (terminal == address(0)) revert NoTerminal();
            IJBTerminalMinimal(terminal).addToBalanceOf{value: swept}(PROJECT_ID, NATIVE_TOKEN, swept, false, memo, "");
            emit SurplusSwept(swept);
        }

        if (attached) {
            sweepMarkAmount = _unallocated();
            sweepMarkTime = block.timestamp;
            emit SurplusMarked(sweepMarkAmount, block.timestamp + SWEEP_DELAY);
        } else {
            sweepMarkAmount = 0;
            sweepMarkTime = 0;
        }
    }

    /// @notice One backer's settle + credit + pay, in its own call frame so a failure only affects them.
    /// @dev Only callable by this contract, from within `sync` / `payOwed`.
    function processBacker(address backer, uint256 pct, uint256 free, bool settle)
        external
        returns (uint256 credit)
    {
        if (msg.sender != address(this) || _status != _ENTERED) revert OnlySelf();

        // The platform fee receiver's leaderboard balance can include fees the leaderboard put back after
        // a failed fee payment; the backers who paid that rent were already credited in full.
        if (settle && backer != LEADERBOARD.platformFeeReceiver()) {
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
                credit = _share(settled, pct);
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
        if (backer != LEADERBOARD.platformFeeReceiver()) {
            credit = _share(LEADERBOARD.pendingSettlement(backer), LEADERBOARD.percentToBeneficiary());
        }
        uint256 free = _unallocated();
        return owedOf[backer] + (credit < free ? credit : free);
    }

    /// @notice Funds held (ETH + ETHx) that are not owed to any backer: stream not yet synced, slices
    ///         stranded by external settles, and rounding dust.
    function unallocated() external view returns (uint256) {
        return _unallocated();
    }

    /// @notice When the next `sweepSurplus` can sweep while attached (0 = no record yet: the next call
    ///         only records).
    function sweepableAt() external view returns (uint256) {
        return sweepMarkTime == 0 ? 0 : sweepMarkTime + SWEEP_DELAY;
    }

    /// @notice The beneficiary-side share that corresponds to `settledRent` of MARKEE-side rent.
    function shareOf(uint256 settledRent) external view returns (uint256) {
        return _share(settledRent, LEADERBOARD.percentToBeneficiary());
    }

    // ─── Internals ──────────────────────────────────────────────────────────────

    function _processAll(address[] calldata backers, bool settle) internal {
        uint256 pct = settle ? LEADERBOARD.percentToBeneficiary() : 0;
        // Funds held that are not yet promised to anyone. Credits are capped by it, which keeps the
        // invariant totalOwed <= funds held (the percentage-based share can overshoot the stream by
        // rounding dust, since the leaderboard rounds the beneficiary flow rate down). Payouts reduce held
        // funds and totalOwed equally, so it only shrinks by the credits made.
        uint256 free = settle ? _unallocated() : 0;

        for (uint256 i = 0; i < backers.length; i++) {
            address backer = backers[i];
            if (backer == address(0)) continue;
            // Every backer must get its full BACKER_GAS (the EVM forwards at most 63/64 of what is left).
            // A sync sent with less reverts here, so gas estimation is forced to cover it, and a failure
            // inside a backer's call can only come from that backer or the project, never the caller.
            if (gasleft() < (BACKER_GAS * 64) / 63 + GAS_RESERVE) revert InsufficientGas();
            try this.processBacker{gas: BACKER_GAS}(backer, pct, free, settle) returns (uint256 credit) {
                free -= credit;
            } catch (bytes memory reason) {
                emit BackerSkipped(backer, reason);
            }
        }
    }

    function _unallocated() internal view returns (uint256) {
        uint256 held = address(this).balance + ETHX.balanceOf(address(this));
        return held > totalOwed ? held - totalOwed : 0;
    }

    function _share(uint256 settledRent, uint256 pct) internal pure returns (uint256) {
        if (pct == 0 || pct >= BPS) return 0;
        return (settledRent * pct) / (BPS - pct);
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
