# Streaming keeper

This route heals streaming boards. It calls `claimTop` on every board whose live #1
(`getTopMarkees[0]`, ranked by `effectiveRate`) has drifted from the enforced `topMarkee` (a decay, a
stream decrease, or a liquidated top backer, none of which the SuperApp inflow callbacks can auto-heal).
`claimTop` is permissionless and money-safe, so the signer is a throwaway gas-funded hot wallet with no
on-chain privileges. It covers every board each tick (two reads per board in one multicall), so a top
that ran out of money is demoted within one schedule interval of the sentinel closing its stream.

The keeper does not settle: each backer claims their own RevNet share from the UI (`ClaimModal`, which
calls `settle([backer])`).

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
| `KEEPER_PRIVATE_KEY` | Gas-funded hot wallet that signs `claimTop`. Without it every scheduled run returns `500 no signer configured` and nothing is healed. |
| `CRON_SECRET` | Shared with the other cron routes; Vercel cron sends it as the Bearer token. |
| `NEXT_PUBLIC_BASE_RPC_URL` / `ALCHEMY_BASE_URL` | Base RPC, same precedence as the streaming reads. |

## Testing without the scheduler

- `?dryRun=1` reads + plans but signs nothing (no `KEEPER_PRIVATE_KEY` needed):
  `curl -H 'Authorization: Bearer <secret>' 'https://<deploy>/api/cron/streaming-keeper?dryRun=1'`
- On-chain heal: `test/StreamingLeaderboard.t.sol::test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals`.
