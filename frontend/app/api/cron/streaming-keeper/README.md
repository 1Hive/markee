# Streaming keeper

This route heals streaming boards. It calls `claimTop` on every board whose live #1
(`getTopMarkees[0]`, ranked by `effectiveRate`) has drifted from the enforced `topMarkee` (a decay, a
stream decrease, or a liquidated top backer, none of which the SuperApp inflow callbacks can auto-heal).
`claimTop` is permissionless and money-safe, so the signer is a throwaway gas-funded hot wallet with no
on-chain privileges. It covers every board each tick, so a top that ran out of money is demoted within
one schedule interval of the sentinel closing its stream.

Reads go out as multicalls of ten boards. `getTopMarkees` sorts every markee on a board (O(n^2)) and all
boards in one `eth_call` share the RPC's gas cap, so a board whose read fails inside a shared chunk is
retried on its own: an oversized board only loses its own heal, never its chunk-mates'.

## Settlement (`/api/cron/streaming-settle`)

A daily sibling route routes every backer's accrued RevNet share. Backers can still settle their own
from the UI (`ClaimModal`, which calls `settle([backer])`), but most never do, so the cron flushes them.
`settle` is permissionless and pays each backer's tokens to that backer, so the keeper wallet only
spends gas.

Backers come from the Superfluid subgraph (every sender that ever streamed into a board, closed streams
included), owed amounts from `pendingSettlement` read in multicalls. There is no log scan, so run time
does not grow with chain history. Settling costs gas per backer every time it runs, whether or not the
backer is new, so three limits leave work for a later run, each overridable as a query parameter.

- `minPending` (default 0.0001 ETHx). Shares below it are ignored, since the settle would cost more
  than it routes.
- `minBoardPending` (default 0.01 ETHx). A board is settled only once its owed backers together pass it,
  so small boards build up over several days instead of paying gas daily.
- `maxFeeBps` (default 100, i.e. 1%). A settle call whose estimated fee (gas estimate times the current
  gas price) is above this share of what it routes is reported as `skipped` and retried on a later run,
  when gas is cheaper or more has accrued.

Each `settle` costs about 1.9M gas plus 0.7M per extra backer (the RevNet pay), so a board's backers are
split into calls of at most 8. Calls are gas-estimated one by one, then bundled into Multicall3
`aggregate3` batches of up to 12M estimated gas, sent with 30% headroom under Base's 2^24 per-tx cap
(nested RevNet calls only receive 63/64 of the gas at each hop, so a bare estimate runs out). A call that
fails estimation is reported and left out of its batch.

## Trigger

The route is just `runKeeper()` behind an authenticated HTTP call, so testing never needs a scheduler
(see below). In production Vercel cron calls it. It must be a **periodic poll**, not an event/alert
trigger: the decay/decrease that makes a title stale fires no transaction and no event, so only a poll
catches it. The schedules live in `frontend/vercel.json`.

Only one signer exists, so a run that outlives its tick would collide on nonces with the next one. Both
routes take the same KV lock (`lib/server/keeperRoute.ts`) for the duration and return
`skipped: previous run still in flight` instead. Settlement runs at 03:05 UTC, off the keeper's ten
minute ticks.

## Auth & env

The route authorizes a `Bearer <secret>` or `x-keeper-secret: <secret>` against `CRON_SECRET`, which is
what Vercel cron sends. `KEEPER_PRIVATE_KEY` is the only var this route introduces; everything else is
shared with the rest of the app.

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_STREAMING_FACTORY` | Gates the whole feature. Until set, the route no-ops (`skipped: streaming disabled`). |
| `KEEPER_PRIVATE_KEY` | Gas-funded hot wallet that signs `claimTop` and the settle batches. Without it every scheduled run returns `500 no signer configured` and nothing is healed. |
| `CRON_SECRET` | Shared with the other cron routes; Vercel cron sends it as the Bearer token. |
| `ALCHEMY_BASE_URL` / `NEXT_PUBLIC_BASE_RPC_URL` | Base RPC: the server-only key first, the public browser RPC as fallback (same precedence as the streaming reads). |

## Testing without the scheduler

- `?dryRun=1` reads + plans but signs nothing (no `KEEPER_PRIVATE_KEY` needed):
  `curl -H 'Authorization: Bearer <secret>' 'https://<deploy>/api/cron/streaming-keeper?dryRun=1'`
  (same for `/api/cron/streaming-settle`, which then lists every owed backer and amount).
- On-chain heal: `test/StreamingLeaderboard.t.sol::test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals`.
