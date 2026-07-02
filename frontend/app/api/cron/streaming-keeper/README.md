# Streaming keeper

This route heals streaming boards: it calls `claimTop` when a board's live #1 (`getTopMarkees[0]`,
ranked by `effectiveRate`) has drifted from the enforced `topMarkee` (a decay or a stream decrease the
SuperApp inflow callbacks can't auto-heal), and `settle` to flush each backer's accrued RevNet share.
Both calls are permissionless and money-safe, so the signer is a throwaway gas-funded hot wallet with no
on-chain privileges.

## Trigger

The route is just `runKeeper()` behind an authenticated HTTP call, so testing never needs a scheduler
(see below). In production an automated job calls it on a schedule — not wired yet. It must be a
**periodic poll**, not an event/alert trigger: the decay/decrease that makes a title stale fires no
transaction and no event, so only a poll catches it.

## Auth & env

The route authorizes a `Bearer <secret>` or `x-keeper-secret: <secret>` against `KEEPER_TRIGGER_SECRET`.

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_STREAMING_FACTORY` | Gates the whole feature. Until set, the route no-ops (`skipped: streaming disabled`). |
| `KEEPER_TRIGGER_SECRET` | Shared secret the trigger sends (Bearer or `x-keeper-secret`). |
| `KEEPER_PRIVATE_KEY` | Gas-funded hot wallet that signs `claimTop`/`settle`. |
| `KEEPER_RPC_URL` | Base RPC (falls back to `ALCHEMY_BASE_URL`). |
| `KEEPER_FROM_BLOCK` | Optional. `BackerUpdated` log-scan start for `settle` (bounds the lookback). |

## Testing without the scheduler

- `?dryRun=1` reads + plans but signs nothing (no `KEEPER_PRIVATE_KEY` needed):
  `curl -H 'Authorization: Bearer <secret>' 'https://<deploy>/api/cron/streaming-keeper?dryRun=1'`
- On-chain heal: `test/StreamingLeaderboard.t.sol::test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals`.
