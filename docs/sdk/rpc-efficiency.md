# RPC usage controls

## Listings

Routine account loads use shared 60-second listing snapshots. Explicit callbacks
after a mutation can still request `bust=1`. The five listing APIs share the same
lease and fenced-publication implementation as SDK display snapshots. One loader
per listing can refresh at a time; contenders receive an available last-good
snapshot marked `stale`, or a 503 with Retry-After on a cold cache. An outage in
storage never starts uncoordinated RPC reads. Address-filtered streaming requests
share the full listing snapshot. Refreshes have a 60-second function limit and
65-second leases. Display caches never authorize a financial transaction.

## Rental lifetime totals

Replay responses are shared for 30 seconds per board/message/backer. Safe cursors
advance through successfully scanned empty ranges as well as events. The most
recent 100 blocks remain unpersisted and are replayed again for reorg safety.
Failed RPC reads retain the previous checkpoint. The cumulative amounts, rate,
and timestamp keep their existing meanings; the client continues ticking locally.

## Moderation scans

Per-board append cursors track newly created messages. Five-minute scans reuse
stored observations for unchanged messages and read text/name/owner for new IDs,
edit events, unknown top IDs, and hourly reconciliation of the recent
1,000/top-50 window. Top rankings and ranked-message owners are still refreshed for activity notifications; unchanged text is reused.
Edit scans overlap 100 blocks; the existing 20,000-block catch-up cap remains.
Reads use a consistent block. Failed reads do not advance checkpoints. Manual
flags remain separate, and the automatic checker still evaluates exact text.
Multicall chunks and edit-log ranges run sequentially to bound RPC bursts.

## CI measurement

See `frontend/tests/e2e/fork/README.md` for the Anvil lifecycle and RPC report.
The local cache regression observed 64 upstream storage reads cold and zero
warm. This is a synthetic local measurement, not a production savings claim.
Compare uploaded counts from real CI runs at the same pinned fork block before
and after rollout. No production transactions are required for these checks.
