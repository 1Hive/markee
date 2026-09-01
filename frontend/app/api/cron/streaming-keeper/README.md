# Streaming keeper

This route heals streaming boards: it calls `claimTop` when a board's live #1 (`getTopMarkees[0]`,
ranked by `effectiveRate`) has drifted from the enforced `topMarkee` (a decay or a stream decrease the
SuperApp inflow callbacks can't auto-heal), and `settle` to flush each backer's accrued RevNet share.
Both calls are permissionless and money-safe, so the signer is a throwaway gas-funded hot wallet with no
on-chain privileges.

## Trigger

The route is just `runKeeper()` behind an authenticated HTTP call, so testing never needs a scheduler
(see below). In production Vercel cron calls it. It must be a **periodic poll**, not an event/alert
trigger: the decay/decrease that makes a title stale fires no transaction and no event, so only a poll
catches it. The schedule still has to be added to `frontend/vercel.json`.

Only one signer exists, so a run that outlives its tick would collide on nonces with the next one. The
route takes a KV lock for the duration and returns `skipped: previous run still in flight` instead.

## Auth & env

The route authorizes a `Bearer <secret>` or `x-keeper-secret: <secret>` against `CRON_SECRET`, which is
what Vercel cron sends. `KEEPER_PRIVATE_KEY` is the only var this route introduces; everything else is
shared with the rest of the app.

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_STREAMING_FACTORY` | Gates the whole feature. Until set, the route no-ops (`skipped: streaming disabled`). |
| `KEEPER_PRIVATE_KEY` | Gas-funded hot wallet that signs `claimTop`/`settle`. |
| `CRON_SECRET` | Shared with the other cron routes; Vercel cron sends it as the Bearer token. |
| `NEXT_PUBLIC_BASE_RPC_URL` / `ALCHEMY_BASE_URL` | Base RPC, same precedence as the streaming reads. |
| `STREAMING_FROM_BLOCK` | Set it to the factory deploy block: without it the `BackerUpdated` scan only looks back 50k blocks, and a backer whose last stream change predates that window is missed by `settle`. Shared with `/api/streaming/leaderboards`, which reads it `bounded` (clamped to the 50k window) because it is a request-path read; the keeper is the only unbounded consumer, since scan cost grows as the deploy block recedes. |

## Testing without the scheduler

- `?dryRun=1` reads + plans but signs nothing (no `KEEPER_PRIVATE_KEY` needed):
  `curl -H 'Authorization: Bearer <secret>' 'https://<deploy>/api/cron/streaming-keeper?dryRun=1'`
- On-chain heal: `test/StreamingLeaderboard.t.sol::test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals`.
