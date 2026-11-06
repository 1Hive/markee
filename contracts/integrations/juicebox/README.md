# MarkeeJuiceboxForwarder

Pays a Markee **For Rent** sign's beneficiary share into a **Juicebox v6** project, and issues the project's tokens to
the same backers who receive MARKEE for that rent.

- One contract, self-contained (inline minimal interfaces, no Markee or Juicebox imports), MIT licensed.
- No owner, no admin, no upgrades. Everything is set once in the constructor.
- Needs no changes to Markee's contracts or frontend.
- **For Rent signs only.** It rejects plain ETH, so if it is set as a For Sale beneficiary, purchases on that sign
  revert (no funds are lost) until the admin switches the beneficiary back.

## How it works

1. A For Rent sign's `StreamingLeaderboard` streams the beneficiary share (62% by default) of the #1 message's rent
   to its `beneficiaryAddress` as ETHx. Point that at this forwarder.
2. The remaining share (38% by default) accrues per backer on the leaderboard for MARKEE (`pendingSettlement`).
   Both shares come from the same rent, so a backer's slice of the ETHx this contract received is
   `settledMarkeeRent × pct / (10000 − pct)`.
3. Anyone calls `sync(backers)`. For each backer, the forwarder:
   1. settles their MARKEE on the leaderboard (the same call as Markee's Claim button),
   2. credits the matching beneficiary share, measured from what the leaderboard actually settled,
   3. unwraps that ETHx and calls `pay` on the project's primary ETH terminal (resolved from `JBDirectory` at
      pay time), with the backer as the token beneficiary.

Backers are identified by the leaderboard's own per-backer ledger, i.e. the address that opened the stream, so
smart-wallet backers (e.g. Coinbase Smart Wallet) receive project tokens at their smart wallet, the same address
that receives MARKEE.

Keeping it running: `sync` is not automatic (a Superfluid stream gives the receiver no per-payment callback). Run a
keeper with the board's backers (from the leaderboard's `BackerUpdated(backer, markee, flowRate, newAggregate)`
events):

- **Daily:** `sync(backers)`. Issues project tokens for the rent accrued since the last sync.
- **Weekly:** `sweepSurplus(backers)`. Moves anything that couldn't be attributed (see "Claim before sync" below)
  into the project's balance, so the project always receives all of the ETH.

Callers cannot redirect funds or tokens; they only choose when things happen. Send each call with at least
**5.1M gas per backer** available (`BACKER_GAS`, about 1M is actually used); gas estimation handles this.

## Deploy and attach (Base)

| | Address |
|---|---|
| JBDirectory (v6) | `0x5AfF29060E023e6FB87BE5596652B33c65Af535B` |
| JBMultiTerminal (v6) | `0x130f5Dd2bD8805443Cf41755253D778a75a67f53` |
| ETHx | `0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93` (read from the leaderboard automatically) |

1. Create the For Rent sign on Markee (any beneficiary for now) and note its leaderboard address.
2. Deploy: `LEADERBOARD=0x… JB_PROJECT_ID=… forge script script/DeployMarkeeJuiceboxForwarder.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify`
3. As the sign's admin, call `leaderboard.setBeneficiaryAddress(forwarder)`.
   - **If the sign already has backers**, do it in one batched transaction (e.g. a Safe batch):
     `leaderboard.settle(allBackers)` and then `leaderboard.setBeneficiaryAddress(forwarder)`. Otherwise rent that
     accrued while someone else was the beneficiary would be credited out of the forwarder's balance.
   - The same applies if you ever switch the beneficiary away and later back again.

## Functions

| Function | Who | What |
|---|---|---|
| `sync(address[] backers)` | anyone | Settle MARKEE, credit the beneficiary share, pay the project. Reverts unless this contract is currently the beneficiary. |
| `payOwed(address[] backers)` | anyone | Retry payments that failed (project paused, no ETH terminal). Works after detaching too. |
| `sweepSurplus(address[] backers)` | anyone | Adds funds no backer can be credited for to the project's balance via `addToBalanceOf` (no tokens issued). **While attached:** syncs `backers` first, then sweeps what the previous call recorded as unallocated (if still unallocated) once 7 days (`SWEEP_DELAY`) have passed, and records the current amount for next time. The first call only records; an early call reverts with `SweepNotReady` and cannot move the clock. **Once detached:** sweeps everything unallocated immediately. |
| `sweepableAt()` | view | When the next attached sweep can run (0 = the next call only records). |
| `pendingCredit(backer)` | view | What a sync would credit now, plus anything already owed. |
| `unallocated()` | view | Funds held that are not owed to anyone. |
| `owedOf(backer)`, `totalOwed` | view | Credits waiting for a successful payment. |

## Guarantees

- Project funds only ever go to `PROJECT_ID`, and project tokens only to the backer whose leaderboard settlement
  produced the credit. Never to the caller.
- Each slice of rent is credited at most once: duplicates in `backers`, repeated syncs, and MARKEE payouts that the
  leaderboard fails and restores all credit zero.
- Solvency: credits are capped by unallocated funds, so `totalOwed ≤ funds held` always.
- No ETH is ever stranded: whatever can't be credited to a backer reaches the project through `sweepSurplus`.
- A failed Juicebox payment never reverts the sync. The MARKEE settlement still happens and the credit stays owed.
- **One backer can't block the others.** Each backer runs in its own call with `BACKER_GAS`. If it fails (e.g. a
  backer contract that burns gas when the leaderboard pays it directly), everything for that backer is rolled back,
  including the leaderboard settle, and `BackerSkipped(backer, reason)` is emitted. The rest of the batch syncs.
- **Too little gas reverts instead of half-succeeding.** A call without `BACKER_GAS` available for the next backer
  reverts with `InsufficientGas`, so wallets, crons and gas estimators always supply enough for every payout.
- The leaderboard's platform fee receiver is never credited: its leaderboard balance can include fees the
  leaderboard put back after a failed fee payment, which the backers who paid that rent were already credited for.

## Known limitations

- **Claim before sync.** If a backer's MARKEE is settled by anyone other than this contract (e.g. Markee's Claim
  button) before a `sync`, the project tokens for that period can no longer be attributed. It is never
  over-credited, and the weekly `sweepSurplus` moves its ETH to the project. Anyone can trigger this deliberately by
  calling `leaderboard.settle` for backers; that costs them gas and only reduces those backers' project tokens.
- **Sync within a week.** Rent must be synced within `SWEEP_DELAY` (7 days) of accruing. A sweep syncs the backers
  it is given first, but rent of a backer left out of both the daily syncs and the weekly sweep for over a week can
  be swept to the project without issuing tokens for it. A daily keeper with the full backer list avoids this.
- **Percentage changes.** Credits use the factory's current `percentToBeneficiary`. If the Markee Cooperative changes
  it, rent accrued before the change is credited at the new ratio (bounded by the solvency cap).
- **`minReturnedTokens` is 0** and no pay metadata is passed. Juicebox projects with a buyback hook use their own
  pricing logic. Small, frequent syncs limit exposure.
- **Rounding.** The leaderboard rounds the beneficiary flow rate down, so the percentage-based share overshoots the
  stream by roughly 1e-10. The solvency cap trims that dust.

## Tests

Base-mainnet fork tests against the real `StreamingLeaderboard`, Superfluid ETHx, and Juicebox v6 terminal:

```bash
BASE_RPC_URL=<base-rpc> forge test --match-contract MarkeeJuiceboxForwarderTest -vv
```

The app-level E2E (`frontend/tests/e2e/fork/juicebox-forwarder.spec.ts`) creates a For Rent sign and streams to it
through the unchanged Markee app on an Anvil fork, attaches the forwarder, and checks `sync` and the Claim button:

```bash
cd frontend && npm run test:e2e:fork -- juicebox-forwarder
```
