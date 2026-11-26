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

Automatic evaluation shares the scan's server-created client and pinned block.
Board identity is resolved once per distinct board and membership once per distinct
board/Markee pair, using sequential batches of at most 128 subcalls (these
single-address selectors keep the encoded aggregate under 64 KiB). This reuse
lasts only for that invocation; membership is not cached across scans or requests.
Verdict writes still run in groups of 25. An unknown membership result aborts the
automatic scan evaluation before publishing verdicts or advancing scan checkpoints.
Other readers still resolve a fresh head and return unavailable for unknown trust.

A synthetic comparison using viem's real multicall encoding and a mocked JSON-RPC
transport, with 1,000 members on one non-root board, measured the previous 25-item
scan path at 40 head reads and 120 eth_calls; the shared pinned path used zero extra
head reads and 10 eth_calls. At the issue #85 estimates of 10 CU/head and
26 CU/eth_call, that membership stage is 3,520 versus 260 CU per scan. This is not
a measured production saving and excludes enumeration, text, activity and logs.
The five-minute schedule, edit coverage, hourly reconciliation, SDK display cache
durations, live authorization, and transaction recovery formats are unchanged.

For rollout, compare complete matching UTC hours in Alchemy MCP for the server
app and in route logs for every environment sharing its key. Record deployment,
request count, observed member/board counts, reconciliation runs, RPC methods and
errors. Normalize moderation CU per successful scan; include failed attempts.
Confirm that no extra membership eth_blockNumber calls remain, detection is still
within the existing five-minute cadence, and unavailable/checkpoint behavior holds.
Production-only route logs cannot attribute staging usage of the same key. Keep
the missing-usage fraction provisional until the same app/time window reconciles.

### Published moderation checks

The public published check shares complete, membership-verified chain observations
for 60 seconds per Base Markee. Overlapping batches fetch only missing IDs.
Manual flags, overrides, and board policies are resolved on each request. Cached
observations cannot write into the moderation queue or invalidate SDK snapshots.
The website batches nearby requests for 50 ms and still verifies the returned
message hash against the displayed text and verifies the name hash before showing
a live author name. A new revision stays hidden or blurred until a fresh
observation is available. Scan and write paths keep their
existing chain reads.

### Integration budget

Run `npm run test:rpc:usage --prefix frontend -- --alchemy-usage /path/to/usage.json`
before merging RPC-related changes.
CI runs `npm run test:rpc:usage -- --fixtures-only` in the frontend job and uploads
the JSON report as the `mocked-rpc-usage` artifact, including after test failures.
The monthly account forecast can also run in the separate account-budget workflow.
The integration check executes
the real scan, automatic evaluation, membership verifier and viem HTTP/multicall
encoding against deterministic chain responses and isolated in-memory storage.
It needs no credentials, does not call Alchemy, and cannot write production KV.
Activity, email and top-history sinks are isolated and excluded from its budget.

The 1,000-member fixture covers cold, warm, edit, hourly reconciliation and
membership-unavailable scans. It fails on extra head reads, excess eth_calls,
unbounded membership batches/concurrency, unpinned contract reads, missed edits,
or checkpoint/verdict writes after failed membership. Review any budget change;
do not increase budgets merely to make a regression pass.

The report is `frontend/test-results/rpc-usage/moderation.json`: method and
subcall counts, estimated CU, fixture size and budgets. It contains no keys or
RPC payloads. Compare reports on the same fixture across revisions. The method
costs (26/10/16/60 CU for call/head/block/logs) are estimates, not billing data.
Use Alchemy MCP and aligned environment logs separately to confirm actual spend;
this fixture report alone cannot measure staging traffic or production savings.

The same command now also enforces a monthly all-app forecast against
`tests/integration/rpc-monthly-budget.json`: 111,100,000 CU from the user's rounded
111.1M dashboard limit (a conservative threshold, not an inferred USD conversion).
The manually running agent retrieves fresh data using **Alchemy MCP, Markee**:
`get_usage_summary` plus an unfiltered, ungrouped `get_usage_time_series` for the
last 24 complete UTC hours, granularity `hour`, metric `amount`, product
`SUPERNODE_CU`. Export the tools' inner `data` objects into this JSON envelope:

```json
{
  "source": "alchemy-mcp",
  "account": "Markee",
  "scope": "all-apps",
  "summary": { "billingPeriod": {}, "totals": {}, "freshness": {} },
  "hourly": { "query": {}, "freshness": {}, "data": [] }
}
```

The abbreviated objects above must contain the complete corresponding MCP
responses. Keep the export outside tracked source or under ignored `test-results`.
Missing, stale (over 24 hours), wrong-period, partial, incomplete, or filtered
evidence fails the check; it must cover the whole account, including nonproduction
and CI apps. The account's USD limit is not used as a CU limit.

Forecast = used month-to-date CU + remaining billing-period hours multiplied by
the **highest** hourly rate from month-to-date, the last seven days, and the last
24 complete hours. The JSON report includes inputs' observation time, rates,
projected total, remaining allowance, affordable hourly rate and headroom. A
forecast above the configured limit exits nonzero. It never credits undeployed
fixture savings or treats a forecast as a spending guarantee.

`--fixtures-only` explicitly runs offline regression checks without the forecast;
the report status is `fixtures-only`, not an account-budget pass. No arguments
cannot silently skip the monthly check. Refresh the MCP export for every manual
budget review. The account forecast is not a scheduled monitoring task.

### Account budget via the Alchemy Admin API

Add a GitHub Actions **secret** named `ALCHEMY_ADMIN_ACCESS_KEY`, created for the
Markee Alchemy team with **Usage read** permission. This is an Admin API access
key, not an app RPC key. Do not put it in plain repository variables or Vercel.
The separate `Alchemy account budget` workflow runs on pushes to `main`, or via
Run workflow on `main` after the workflow is merged. It never runs on PR code.
Keep this separate workflow out of required PR checks: current deployed account
spend is not a forecast of an unmerged feature's incremental RPC cost.

The runner calls `GET /v1/usage/summary` and `POST /v1/usage/time-series` on
`https://admin-api.alchemy.com`, follows pagination, and uses the 24 complete hours
ending at the summary's latest complete hour. It uses the same unfiltered all-app
forecast validation and CU limit as MCP exports. Missing credentials, invalid or
incomplete data, API errors and over-limit forecasts fail this separate workflow;
none are treated as a budget pass. The summary and `alchemy-account-forecast`
artifact (14 days) show the result. Request credentials and raw responses are not
logged or uploaded. No blockchain RPCs or transactions are issued by this check.

Local command with the access key injected into the environment:
`node --import tsx tests/integration/alchemy-account-budget.ts` from `frontend`.
Reference: https://www.alchemy.com/docs/reference/admin-api/quickstart
As a regression control, running this manual check on unchanged main failed the
cold budget with 40 extra head reads and 128 eth_calls. The optimized cold core
scan used zero extra head reads and 18 eth_calls; its subsequent warm scan used
16 eth_calls. These figures include the core scan only, with the sinks above excluded.

## CI measurement

See `frontend/tests/e2e/fork/README.md` for the Anvil lifecycle and RPC report.
The local cache regression observed 64 upstream storage reads cold and zero
warm. This is a synthetic local measurement, not a production savings claim.
Compare uploaded counts from real CI runs at the same pinned fork block before
and after rollout. No production transactions are required for these checks.
