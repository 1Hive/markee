// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// ─── Minimal external interfaces (self-contained: no Markee or Juicebox imports) ──────────────

/// @notice The subset of a Markee "For Rent" StreamingLeaderboard this forwarder reads and calls.
interface IMarkeeRentLeaderboard {
    function ETHX() external view returns (address);
    function beneficiaryAddress() external view returns (address);
    function percentToBeneficiary() external view returns (uint256);
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
///
/// @dev Trust model: no owner, no admin, no upgradability, all configuration immutable. Callers of
///      `sync` / `payOwed` / `sweepSurplus` choose only *when* things happen, never *where* funds go:
///      project funds always go to PROJECT_ID, and project tokens always go to the backer whose
///      leaderboard ledger produced the credit.
///
/// @dev Known limitations (see README):
///      - If a backer's rent is settled on the leaderboard by someone other than this contract (e.g. the
///        Markee Claim button) before a `sync`, the beneficiary share accrued since the last sync can no
///        longer be attributed. It is never over-credited; it stays here unattributed. Frequent syncs
///        (anyone can run a cron) keep this small.
///      - Credits assume this contract was the leaderboard's beneficiary for the whole period being
///        settled. When attaching to a sign that already has backers, settle all of them in the same
///        transaction that sets this contract as beneficiary.
///      - Payouts are capped by the funds actually held; any shortfall stays owed and is paid later.
///      - Plain ETH transfers are rejected, so this contract cannot be (mis)used as a For Sale beneficiary:
///        that purchase reverts with `DirectEthNotAccepted` instead of silently issuing no tokens.
contract MarkeeJuiceboxForwarder {
    /// @notice Juicebox's native-token sentinel (ETH).
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
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

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    event Credited(address indexed backer, uint256 settledRent, uint256 credit);
    event Paid(address indexed backer, uint256 amount, uint256 beneficiaryTokenCount);
    event PaymentFailed(address indexed backer, uint256 amount, bytes reason);
    event SurplusSwept(uint256 amount);

    error ZeroAddress();
    error ZeroProjectId();
    error DirectEthNotAccepted();
    error NotBeneficiary();
    error StillBeneficiary();
    error NoTerminal();
    error Reentrancy();

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
    ///      Each backer is settled individually and credited with exactly what the leaderboard settled
    ///      (pending before minus pending after), so duplicates, zero balances and failed MARKEE payouts
    ///      (which the leaderboard restores) can never be double-credited.
    function sync(address[] calldata backers) external nonReentrant {
        if (LEADERBOARD.beneficiaryAddress() != address(this)) revert NotBeneficiary();
        uint256 pct = LEADERBOARD.percentToBeneficiary();
        // Funds held that are not yet promised to anyone. Credits are capped by it, which keeps the
        // invariant totalOwed <= funds held (the percentage-based share can overshoot the stream by
        // rounding dust, since the leaderboard rounds the beneficiary flow rate down). Payouts within
        // this call reduce held funds and totalOwed equally, so it only shrinks by the credits made.
        uint256 free = _unallocated();

        address[] memory one = new address[](1);
        for (uint256 i = 0; i < backers.length; i++) {
            address backer = backers[i];
            if (backer == address(0)) continue;

            uint256 before = LEADERBOARD.pendingSettlement(backer);
            if (before > 0) {
                one[0] = backer;
                LEADERBOARD.settle(one);
                uint256 remaining = LEADERBOARD.pendingSettlement(backer);
                uint256 settled = remaining < before ? before - remaining : 0;
                uint256 credit = _share(settled, pct);
                if (credit > free) credit = free;
                if (credit > 0) {
                    free -= credit;
                    owedOf[backer] += credit;
                    totalOwed += credit;
                    emit Credited(backer, settled, credit);
                }
            }
            _pay(backer);
        }
    }

    /// @notice Retry paying backers who already have an outstanding credit (e.g. after a failed or
    ///         underfunded payment). Works even if this contract is no longer the beneficiary.
    function payOwed(address[] calldata backers) external nonReentrant {
        for (uint256 i = 0; i < backers.length; i++) {
            _pay(backers[i]);
        }
    }

    /// @notice Once this contract is no longer the leaderboard's beneficiary, nothing more can be
    ///         attributed, so anything above outstanding credits is added to the project's balance
    ///         (no tokens issued). Reverts while this contract is still the beneficiary.
    function sweepSurplus() external nonReentrant {
        if (LEADERBOARD.beneficiaryAddress() == address(this)) revert StillBeneficiary();
        uint256 surplus = _unallocated();
        if (surplus == 0) return;

        _ensureEth(surplus);
        address terminal = _terminal();
        if (terminal == address(0)) revert NoTerminal();
        IJBTerminalMinimal(terminal).addToBalanceOf{value: surplus}(PROJECT_ID, NATIVE_TOKEN, surplus, false, memo, "");
        emit SurplusSwept(surplus);
    }

    // ─── Views ──────────────────────────────────────────────────────────────────

    /// @notice What a `sync` of this backer alone would credit right now, plus anything already owed.
    function pendingCredit(address backer) external view returns (uint256) {
        uint256 credit = _share(LEADERBOARD.pendingSettlement(backer), LEADERBOARD.percentToBeneficiary());
        uint256 free = _unallocated();
        return owedOf[backer] + (credit < free ? credit : free);
    }

    /// @notice Funds held (ETH + ETHx) that are not owed to any backer: stream not yet synced, slices
    ///         stranded by external settles, and rounding dust.
    function unallocated() external view returns (uint256) {
        return _unallocated();
    }

    /// @notice The beneficiary-side share that corresponds to `settledRent` of MARKEE-side rent.
    function shareOf(uint256 settledRent) external view returns (uint256) {
        return _share(settledRent, LEADERBOARD.percentToBeneficiary());
    }

    // ─── Internals ──────────────────────────────────────────────────────────────

    function _unallocated() internal view returns (uint256) {
        uint256 held = address(this).balance + ETHX.balanceOf(address(this));
        return held > totalOwed ? held - totalOwed : 0;
    }

    function _share(uint256 settledRent, uint256 pct) internal pure returns (uint256) {
        if (pct == 0 || pct >= BPS) return 0;
        return (settledRent * pct) / (BPS - pct);
    }

    /// @dev Pays as much of `backer`'s credit as the funds held allow. Never reverts on a terminal
    ///      failure: the credit simply stays owed for a later `sync` / `payOwed`.
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
