# MarkeeJuiceboxForwarder (beta)

> [!WARNING]
> **Brand new, experimental and unaudited. Not part of Markee's production product.**
>
> - It was written in November 2026 and has only been tested on Base-mainnet forks. As far as we know it has not
>   handled real funds yet.
> - It has had internal and automated reviews, but no independent security audit.
> - Markee publishes it for teams who want to build on it. Markee does not operate, monitor or support deployments
>   of it.
> - It has no admin and cannot be upgraded or paused. If something is wrong with a deployment, the fix is to point
>   your sign's beneficiary somewhere else, recover what you can with `payOwed` and `sweepSurplus`, and deploy a new
>   version.
> - The interface may change between versions. `VERSION()` returns the release, currently `0.3.0-beta`.
>
> Read the code, try it on a fork first, and start with amounts you can afford to lose.

Point a Markee **For Rent** sign's beneficiary at this contract and the sign's rent flows into your **Juicebox v6**
project. Each backer also receives your project's tokens, on top of the MARKEE they already earn for the same rent,
at the same address.

- **For Rent signs only.** It rejects plain ETH, so it can't be the beneficiary of a For Sale sign. Purchases on
  such a sign would revert (no funds lost) until the beneficiary is switched back.
- **Standalone.** It's one MIT-licensed file with inline interfaces. It needs no changes to Markee's contracts or
  app, and no admin, owner or upgrades: everything is set once at deployment.
- **Permissionless.** Anyone can trigger payouts. Callers only choose *when* things happen, never *where* funds or
  tokens go.

Contents: [How it works](#how-it-works) · [Try it with your project](#try-it-with-your-project) ·
[Build a UI](#build-a-ui-for-it) · [Run a keeper](#run-a-keeper) · [Reference](#reference) ·
[Known limitations](#known-limitations) · [Tests](#tests)

## How it works

1. A For Rent sign streams the beneficiary share (62% by default) of the #1 message's rent, as ETHx, to its
   `beneficiaryAddress`, which is this forwarder.
2. The rest of the rent accrues per backer on the sign's leaderboard, and is paid out as MARKEE when settled.
3. `sync(backers)` settles each backer's MARKEE (the same thing Markee's Claim button does), works out that backer's
   matching slice of the ETH this forwarder received, and pays it into your project with the backer as the token
   recipient.
4. `sweepSurplus` moves ETH that can't be matched to any backer into your project's balance, with no tokens issued
   for it. That happens when a backer claims through Markee's own Claim button before a sync. Your project always
   ends up with all of the ETH.

Streams have no per-payment callback, so step 3 is not automatic. Someone has to call `sync`: you, a keeper, or
backers themselves through your UI.

## Try it with your project

### What you need

- A **Juicebox v6 project on Base** that accepts ETH through its primary terminal (any standard project or RevNet
  does). Note its project ID.
- A **Markee For Rent sign** you are the admin of. Create one on [markee.xyz](https://markee.xyz) and note its
  leaderboard address. You can leave the beneficiary as your own address for now.
- [Foundry](https://book.getfoundry.sh/) and a Base RPC URL (an archive node if you want to fork old blocks).

Base addresses the forwarder uses:

| | Address |
|---|---|
| JBDirectory (v6) | `0x5AfF29060E023e6FB87BE5596652B33c65Af535B` |
| JBMultiTerminal (v6) | `0x130f5Dd2bD8805443Cf41755253D778a75a67f53` |
| JBTokens (v6), for reading token balances | `0x1f80d8f057eE36b4C2656D107E4e4558B71bA7D9` |
| ETHx | `0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93` (read from the leaderboard automatically) |
| Superfluid CFAv1Forwarder | `0xcfA132E353cB4E398080B9700609bb008eceB125` |

### 1. Rehearse on a fork

Run everything below against a local fork first, with a throwaway key:

```bash
anvil --fork-url $BASE_RPC_URL
# in another terminal, point --rpc-url at http://127.0.0.1:8545 and use an Anvil key
```

On the fork you can impersonate your sign's admin (`cast rpc anvil_impersonateAccount <admin>`), attach the
forwarder, open a stream from a test backer, move time forward (`cast rpc evm_increaseTime 86400` then
`cast rpc evm_mine`), and call `sync`. The [tests](#tests) are a working example of every step.

### 2. Deploy

```bash
LEADERBOARD=0xYourSignsLeaderboard JB_PROJECT_ID=123 JB_MEMO="Markee For Rent" \
  forge script script/DeployMarkeeJuiceboxForwarder.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
```

One forwarder serves one sign and one project. Both are fixed at deployment.

### 3. Attach it to your sign

As the sign's admin, call `setBeneficiaryAddress(forwarder)` on the leaderboard:

```bash
cast send 0xYourSignsLeaderboard "setBeneficiaryAddress(address)" 0xYourForwarder --rpc-url $BASE_RPC_URL
```

If the sign **already has backers**, do it in one batched transaction (e.g. a Safe batch): first
`leaderboard.settle(allBackers)`, then `leaderboard.setBeneficiaryAddress(forwarder)`. Otherwise rent that accrued
while someone else was the beneficiary would be paid out of the forwarder's balance. The same applies if you ever
switch away and back again.

### 4. Check it's working

```bash
F=0xYourForwarder
cast call $F "shareRatio()(uint256,uint256)" --rpc-url $BASE_RPC_URL       # nonzero once a message holds #1
cast call $F "pendingCredit(address)(uint256)" 0xABacker --rpc-url $BASE_RPC_URL
cast send $F "sync(address[])" "[0xABacker]" --rpc-url $BASE_RPC_URL
```

After the sync, the backer holds your project's tokens and their MARKEE. Your project's balance went up by their
credit.

### 5. Detaching

To stop, point the sign's beneficiary back at a normal address. Then call `payOwed(backers)` to retry any payments
that are still owed, and `sweepSurplus([])` to move everything else to your project. Both work after detaching.

## Build a UI for it

Everything a UI needs is on the forwarder and the leaderboard. Nothing is admin-gated, so any frontend can offer
these actions to anyone.

### Who the backers are

The leaderboard emits `BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256
newAggregate)` whenever a stream opens, changes or closes. Collect every `backer` from these logs (from the sign's
creation block onward), with an indexer or `getLogs`. Keep backers whose stream has closed (`flowRate` 0) in the
list until `leaderboard.pendingSettlement(backer)` and `forwarder.owedOf(backer)` are both 0: they can still have
rent to sync.

### What to show

| Read | Shows |
|---|---|
| `forwarder.pendingCredit(backer)` | ETH that would go to the project for this backer if synced now (an estimate; includes anything already owed). |
| `leaderboard.pendingSettlement(backer)` | Their unclaimed MARKEE-side rent (ETHx). A sync settles it. |
| `JBTokens.totalBalanceOf(backer, projectId)` | Project tokens the backer holds. |
| `forwarder.owedOf(backer)` | Credited ETH whose project payment failed and is waiting for a retry. |
| `forwarder.sweepable()` / `forwarder.reserve()` | What a sweep would move to the project now, and what it keeps back for unsynced rent. |
| `forwarder.unallocated()` | Funds the forwarder holds that are not owed to anyone yet. |
| `forwarder.VERSION()` | Show it, with a beta label. |

To preview how many project tokens a backer would receive, pass `pendingCredit` to your project's own pricing:
Juicebox's terminal store and ruleset data, or a quote from the Juicebox SDK.

### What to let people do

- **"Claim MARKEE + project tokens"** → `forwarder.sync([backer])`. This is the most important thing to get right.
  A sync settles the backer's MARKEE exactly like Markee's Claim button, *and* issues their project tokens. Using
  Markee's own Claim button instead forfeits the project tokens for that period (the ETH still reaches the
  project). If your audience uses the Markee app, tell them to claim through your UI.
- **"Sync everyone"** → `forwarder.sync(allBackers)`. Anyone can pay the gas to bring the whole board up to date.
- **"Retry payment"** → `forwarder.payOwed([backer])`, shown when `owedOf(backer) > 0`.
- **"Sweep to project"** → `forwarder.sweepSurplus(backers)`, shown when `sweepable() > 0`.

Gas: each listed backer needs about **5.1M gas available** (`BACKER_GAS` + overhead), although about 1M is
actually used. Let the wallet estimate. A transaction sent with less reverts with `InsufficientGas` rather than
half-succeeding, so a too-low manual gas limit fails safely. Keep batches small enough for your users' wallets.

### Example (viem)

```ts
import { createPublicClient, createWalletClient, custom, http, parseAbi, parseAbiItem } from 'viem'
import { base } from 'viem/chains'

const forwarderAbi = parseAbi([
  'function sync(address[] backers)',
  'function sweepSurplus(address[] backers) returns (uint256)',
  'function payOwed(address[] backers)',
  'function pendingCredit(address backer) view returns (uint256)',
  'function owedOf(address backer) view returns (uint256)',
  'function sweepable() view returns (uint256)',
  'function VERSION() view returns (string)',
])

const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) })

// Backers, from the leaderboard's events
const logs = await publicClient.getLogs({
  address: LEADERBOARD,
  event: parseAbiItem('event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)'),
  fromBlock: SIGN_CREATION_BLOCK,
})
const backers = [...new Set(logs.map((l) => l.args.backer!))]

// What a backer would send to the project right now
const credit = await publicClient.readContract({ address: FORWARDER, abi: forwarderAbi, functionName: 'pendingCredit', args: [me] })

// "Claim MARKEE + project tokens"
const wallet = createWalletClient({ chain: base, transport: custom(window.ethereum) })
const [account] = await wallet.getAddresses()
await wallet.writeContract({ account, address: FORWARDER, abi: forwarderAbi, functionName: 'sync', args: [[account]] })
```

Events to listen for (all on the forwarder): `Credited(backer, settledRent, credit)`,
`Paid(backer, amount, beneficiaryTokenCount)`, `PaymentFailed(backer, amount, reason)`, `BackerSkipped(backer,
reason)`, `SurplusSwept(amount)`, `ShareRatioUpdated(beneficiaryRate, retainedRate)` and `BackerExcluded(account)`.

## Run a keeper

So backers get their tokens without doing anything, run a small cron (a GitHub Action, a serverless function, or a
Gelato/Chainlink automation) with any funded key:

- **Daily:** `sync(backers)` with every backer of the board. This issues project tokens for the rent since the last
  sync. Split a large board into several calls if needed.
- **Weekly:** `sweepSurplus(backers)`. This moves funds that couldn't be matched to a backer into your project.

The keeper can't redirect anything, so its key only needs gas money. A sync costs about 1M gas per backer actually
used. If the keeper stops, nothing is lost: backers' rent keeps accruing on the leaderboard and is credited in full
at the next sync, whenever that is.

## Reference

| Function | Who | What |
|---|---|---|
| `sync(address[] backers)` | anyone | Settle each backer's MARKEE, credit their share, pay the project with them as token beneficiary. Reverts with `NotBeneficiary` unless this contract is currently the sign's beneficiary. |
| `payOwed(address[] backers)` | anyone | Retry payments that failed (project paused, no ETH terminal). Works after detaching too. |
| `sweepSurplus(address[] backers)` | anyone | Add funds no backer can be credited for to the project's balance via `addToBalanceOf` (no tokens issued). **While attached:** syncs `backers` first (optional; it only makes the sweep larger), then sweeps what is unallocated beyond `reserve()`. The amount never depends on the caller or the list. **Once detached:** sweeps everything unallocated. Callable any time. |
| `sweepable()` | view | What `sweepSurplus` would move now, before syncing anyone. |
| `reserve()` | view | What an attached sweep keeps back: the share of everything the leaderboard holds, which bounds every backer's unsynced rent. |
| `pendingCredit(backer)` | view | What a sync of this backer would credit now, plus anything already owed. Each estimate is capped by all unallocated funds, so several backers' estimates can add up to more than one sync of all of them would credit. |
| `shareOf(settledRent)`, `shareRatio()` | view | The share for an amount of settled rent, and the live (beneficiary rate, retained rate) ratio behind it. |
| `unallocated()` | view | Funds held that are not owed to anyone. |
| `owedOf(backer)`, `totalOwed()` | view | Credits waiting for a successful payment. |
| `isExcluded(account)` | view | True for every address seen as the platform fee receiver; never credited. |
| `VERSION()`, `LEADERBOARD()`, `PROJECT_ID()`, `DIRECTORY()`, `ETHX()`, `memo()` | view | Configuration, fixed at deployment. |

### Guarantees

- **Funds go only to `PROJECT_ID`, and project tokens only to the backer** whose leaderboard settlement produced the
  credit, never to the caller.
- **Each slice of rent is credited at most once.** Duplicates in `backers`, repeated syncs, and MARKEE payouts that
  the leaderboard fails and restores all credit zero.
- **The share follows the streams.** The leaderboard accrues backers from the rent it actually keeps: the #1 rate
  minus the live beneficiary stream. The forwarder prices shares from the same live rates
  (`beneficiaryRate / (topRate − beneficiaryRate)`). A factory percentage change therefore only applies from the
  moment it reaches the streams, as it does on the leaderboard.
- **Solvency.** Credits are capped by unallocated funds, so `totalOwed ≤ funds held` always.
- **No ETH is ever stranded.** Whatever can't be credited to a backer reaches the project through `sweepSurplus`.
- **Sweeps can't take a backer's rent, whoever calls them.** Every backer's unsettled rent sits on the leaderboard,
  so the share of everything the leaderboard holds bounds what future syncs can still credit. An attached sweep
  keeps that much back. It doesn't matter which backers a caller lists, or whether any keeper ever runs.
- **A failed Juicebox payment never reverts the sync.** The MARKEE settlement still happens and the credit stays
  owed for `payOwed`.
- **One backer can't block the others.** Each backer runs in its own call with `BACKER_GAS`. If it fails (e.g. a
  backer contract that burns gas when the leaderboard pays it directly), everything for that backer is rolled back,
  including the leaderboard settle, and `BackerSkipped` is emitted. The rest of the batch syncs.
- **Too little gas reverts instead of half-succeeding** (`InsufficientGas`), so wallets, crons and gas estimators
  always supply enough for every payout.
- **Platform fee receivers are never credited, including former ones.** A fee receiver's leaderboard balance can
  include fees put back after a failed fee payment, and the backers who paid that rent were already credited. The
  forwarder records the receiver at deployment and on every sync and sweep (`isExcluded`).

## Known limitations

- **Brand new and unaudited.** See the warning at the top.
- **Claim before sync forfeits tokens.** If a backer's MARKEE is settled by anything other than this contract (e.g.
  Markee's Claim button) before a sync, the project tokens for that period can't be attributed any more. The ETH
  still reaches the project through `sweepSurplus`. Anyone can do this deliberately by calling `leaderboard.settle`
  for backers; it costs them gas and only reduces those backers' project tokens.
- **A standing reserve stays in the forwarder while attached.** The reserve covers everything the leaderboard holds,
  including backers' buffer deposits, so it is generous. On a quiet board it is roughly 17 hours of the sign's
  beneficiary income, for example about $15 on a $1,000/month sign. It is swept once you detach, or as the board's
  holdings shrink.
- **Ratio changes between syncs.** When a percentage change reaches the streams, a backer's rent since their last
  sync is credited at the new ratio. With a daily keeper that's at most a day of rent, once per change. Credits
  never exceed funds held, and anything under-credited is swept to the project.
- **Fee receiver rotations between calls.** A receiver is recorded only if it holds the role during a call to this
  contract. Nothing on-chain records past receivers, so this can't be derived. The gap needs three things: a
  receiver held the role only between two forwarder calls, an external settle (e.g. the Claim button) had its
  fee payment fail in that window, and the receiver was rotated before the next forwarder call. Then a sync of
  that old receiver can be credited up to the failed fee's share. That issues project tokens to the old receiver
  for part of a slice the external settle had already stranded, which would otherwise be swept with no tokens. No
  backer is under-credited, because the sweep reserve covers the old receiver's balance too, and the ETH still goes
  only to the project. Calling `sync` (even with an empty list) right after a fee receiver change closes the gap.
- **`minReturnedTokens` is 0**, and no pay metadata is passed. Projects with a buyback hook use their own pricing.
  Small, frequent syncs limit exposure. There's deliberately no fixed minimum: with no admin to change it, a
  minimum that the project's price later fell below would make every payment fail forever.
- **Tied to Juicebox v6's `pay` signature.** The terminal is looked up in `JBDirectory` at pay time and called with
  `pay(projectId, token, amount, beneficiary, minReturnedTokens, memo, metadata)`. A future terminal with different
  semantics would need a new forwarder.
- **Rounding.** Shares round down, and the solvency cap trims any dust overshoot.

## Tests

Base-mainnet fork tests against the real `StreamingLeaderboard`, Superfluid ETHx and Juicebox v6 terminal (30
tests, including the review regressions: a griefer sweeping with incomplete lists and no keeper, a percentage
change, and a fee receiver rotation):

```bash
BASE_RPC_URL=<base-rpc> forge test --match-contract MarkeeJuiceboxForwarderTest -vv
```

The app-level E2E (`frontend/tests/e2e/fork/juicebox-forwarder.spec.ts`) creates a For Rent sign and streams to it
through the unchanged Markee app on an Anvil fork. It then attaches the forwarder and checks `sync`, the Claim
button and the sweep:

```bash
cd frontend && npm run test:e2e:fork -- juicebox-forwarder
```
