# Markee SDK milestones 1–4

## Delivered structure

| Milestone | Implementation |
| --- | --- |
| 1 — central API | `frontend/app/api/sdk/v1/[...path]`, server-only RPC clients, bounded requests, CORS, rate limits, strategy/membership validation, metadata/moderation/views, wallet state, prepared transactions and receipt verification |
| 2 — JavaScript SDK + For Sale | `packages/sdk`, framework-neutral API and Shadow DOM modal, optional React entry point, host wallet adapter, injected discovery, create/fund/edit, review and pending transaction recovery |
| 3 — For Rent | Start/update/switch/stop, exact batch approval, automatic funding, both buffer obligations, mandatory refund-pool connection, ETHx wrap/unwrap, net-flow runway, pool refunds, buffer withdrawal, settlement and actual MARKEE receipt |
| 4 — Gardens administration | Central community resolution, current Safe/owner/keeper activation, current Safe/owner revenue claims, signed fee/recipient constraints, durable one-time challenges and operation recovery, existing outbound bridge quote/execution/status adapters |
| Integration example | `examples/connectkit`: React + ConnectKit + wagmi, using the same connected provider as the host app; light, dark, system and custom brand theme presets |

The Gardens server logic was extracted from `1Hive/gardens-v2` at `078d17954ad38dba7a142eb3cee59002f44d303f`. Each extracted module names its original path. The code no longer depends on Gardens' generated bindings, frontend chain configuration, wallet context, or local database access. Existing Markee routes and production Gardens consumers are unchanged.

## Modal layout

The shared SDK modal follows Gardens' `CommunityStreamingMarkeeModal.tsx` and the form in `CommunityMarkeePlaceholder.tsx`: compact shell, collapsible leaderboard, message card/editor, amount shortcuts, separate deposit management, and fixed footer actions. For Sale adopts that same structure with a one-time payment. Theme configuration stays independent of layout. Strategy-specific financial disclosures come from the SDK API; a board's revenue split is not inferred from the Gardens example.

## Backend configuration

All variables below belong on **Markee's server**, never in a consuming app. `frontend/.env.sdk.example` lists them without credentials.

| Variable | Purpose |
| --- | --- |
| `MARKEE_RPC_8453` / `ALCHEMY_BASE_URL` | Base RPC; public Base RPC is the development fallback |
| `MARKEE_RPC_<chainId>` | RPC for each supported community chain and Sepolia |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Existing Markee views/moderation/metadata, shared SDK rate limits, operation journal and keeper lease |
| `MARKEE_SDK_PUBLIC_DATA_PROXY` | Development only: set `true` to read moderation, view counts and board metadata through Markee's existing public APIs and forward view events there, without local KV credentials |
| `MARKEE_AUTH_REDIS_REST_URL`, `MARKEE_AUTH_REDIS_REST_TOKEN` | Optional separate challenge store; existing KV credentials are the fallback |
| `MARKEE_SDK_SIGNING_SECRET` | At least 32 random characters; signs prepared transaction records. Keep stable across instances/releases for pending receipt recovery |
| `MARKEE_SDK_ALLOWED_ORIGINS` | Optional comma-separated origins; otherwise public CORS without credentials |
| `MARKEE_SDK_FACTORIES_<chainId>` | Additional permitted factories. Base For Sale factory and verified current streaming factory have built-in defaults |
| `MARKEE_ROUTER_ADDRESS_BASE`, `MARKEE_ROUTER_ADDRESS_SEPOLIA` | Gardens integration/revenue routers |
| `MARKEE_STREAMING_LEADERBOARD_FACTORY_ADDRESS_BASE`, `..._SEPOLIA` | Factory bound into community activation signatures |
| `MARKEE_GARDENS_KEEPER_PRIVATE_KEY` | Dedicated authorized router keeper; falls back to existing `KEEPER_PRIVATE_KEY` |
| `MARKEE_KEEPER_ESTIMATION_ADDRESS_BASE`, `..._SEPOLIA` | Optional authorized account for quoting before a keeper signer is configured |
| `SQUID_INTEGRATOR_ID` | Existing Squid outbound routes/status |
| `LIFI_INTEGRATOR_ID`, `LIFI_GARDENS_API_KEY` | Existing LI.FI outbound routes/status |
| `ACROSS_API_KEY`, `ACROSS_INTEGRATOR_ID` | Across server authentication/integration identity |
| `MARKEE_SDK_TOKEN_SEPOLIA` | Optional testnet MARKEE token used for balances/receipt attribution |

A full production build of the existing Markee frontend also needs its existing `NEXT_PUBLIC_PRIVY_APP_ID`; the SDK and ConnectKit sample do not depend on Privy.

Production fails closed when durable state or the transaction-signing secret is missing. Development may keep rate limits, challenges and admin operation records in process memory; this does not survive restart. Public reads require no signer. Keep the keeper configured only where community writes are intended to run.

For an isolated local worktree without database credentials, put `MARKEE_SDK_PUBLIC_DATA_PROXY=true` in `frontend/.env.local`. The sample still uses only its configured SDK API; the backend contacts the fixed `https://www.markee.xyz/api` origin. Failed or malformed responses leave moderation/views unavailable. This mode uses the existing public moderation endpoint's semantics, and real view events are deduplicated by the local server's outbound IP. It is ignored outside development and does not replace production storage, authorization, or keeper configuration.

## API contract

Base path: `/api/sdk/v1`. Amounts/rates/block numbers are decimal strings. Addresses and hashes use `0x`. Prepared-action expiry is epoch **milliseconds**; authorization/bridge quote deadlines are epoch **seconds**. Exported SDK types are the canonical application-level contract.

| Method/path | Request | Result |
| --- | --- | --- |
| `GET snapshot` | JSON-encoded `placement`; optional `account`, `offset` | Board, strategy, limits, top/ranked top, entries, views/moderation, metadata, wallet balances/rates, community permissions |
| `POST prepare` | `{ placement, account, action }` | Server-signed preparation, wallet transaction, review and estimated gas cost |
| `POST verify` | `{ id, hash }` | Pending/confirmed/reverted, created message, actual token transfers and settlement outcome |
| `POST views` | `{ address, message, url? }` | Existing visitor-IP deduped view accounting; call directly from the visitor browser |
| `GET community` | `chainId`, `community` | Current community integration/revenue |
| `GET community/quote` | `chainId`, `community` | Claim amount, fees, expected destination amount and outbound bridge protocol |
| `POST community/activate` | `{ action: 'challenge', chainId, community, account }`, then `{ action: 'verify', nonce, signature }` | Typed-data challenge, then durable operation status/result |
| `POST community/claim` | Same two-step authorization shape | Treasury-bound typed-data challenge, then durable operation status/result |
| `GET operations/<id>` | Opaque operation ID | Working/submitted/complete/failed; saved broadcast hashes are reconciled against chain receipts |
| `GET community/status` | `protocol`, `transactionHash`, `fromChainId`, `toChainId` | Outbound bridge lifecycle, including partial delivery/refund/unknown |

All routes support CORS preflight, use `no-store`, bound JSON body sizes, and rate-limit shared expensive work. There is no arbitrary RPC proxy and no client-supplied URL is fetched by the API. Invalid requests return structured `{ error, code }`; the transplanted community handlers preserve their `{ error }` responses for challenge failures.

Prepared transactions have a five-minute review window and a seven-day verification window. They are checked against exact transaction data and two block confirmations. Receipt token accounting uses actual MARKEE `Transfer` events to the reviewed wallet. Rental settlement additionally requires the board's `Settled` event; a receipt without it is reported as deferred.

Admin signatures are consumed atomically, bind their community/factory/recipient/fee ceiling, and revalidate current council ownership. Requests with the same signature use a durable operation ID and never execute twice. Keeper submissions are serialized across the two SDK admin routes using a shared lease. Other keeper services should use a separate signer, or coordinate the same nonce queue. Signed operations interrupted before a broadcast record require operator reconciliation; the API leaves them pending rather than retrying a potentially executed claim.

## Verification

```sh
npm test --prefix packages/sdk
npm run typecheck --prefix frontend
npm run test:sdk --prefix frontend
npm run build --prefix packages/sdk
npm run build --prefix examples/connectkit
```

Opt-in transaction integration checks use a local Base fork and refuse non-loopback test RPC URLs:

```sh
anvil --fork-url https://mainnet.base.org --chain-id 8453 --port 8547
MARKEE_SDK_FORK_RPC=http://127.0.0.1:8547 npm run test:sdk:fork --prefix frontend
```

The sale/rental suite uses actual deployed contract bytecode and verifies every user transaction path, including actual MARKEE delivery. It uses a deterministic test-only EOA funded solely through `anvil_setBalance`. The community suite deploys purpose-built local fixtures to test current-owner revalidation, ERC-1271 Safe signatures, one-time nonce use, idempotent execution, treasury recipient binding and fee-bearing claims. It requires Foundry and compiles fixtures into a temporary directory.

UI checks cover real public API reads, ConnectKit opening/cancellation, create/review behavior, mobile layout, pending state, account changes and errors. Unit checks cover exact financial parsing, XSS escaping, expired reviews, account/chain changes, duplicate payment blocking, signed-envelope tampering, rental switch ordering and partial bridge status.

Theme checks use browser fixtures: light/dark/custom text contrast, mobile forms, live OS preference changes, draft/focus/scroll preservation without new API reads, payment-review preservation, per-open overrides, resets, invalid-value fallbacks, and listener cleanup on close. Theme updates apply scoped CSS properties only; they do not remount the modal or touch payment logic. The public options are documented in [`packages/sdk/README.md`](../../packages/sdk/README.md#theme).

## Remaining release work

### Shared serverless snapshots (reconciled with the RPC reduction branch)

`/api/sdk/v1` remains the canonical API. The separate `/api/integrations/*`
snapshot routes from `feature/markee-api-snapshots` should not be introduced as
a second permanent public interface. Gardens' existing snapshot consumer branch
is transitional; migration to the SDK remains milestone 7.

Both For Sale and For Rent use the same Redis-backed display cache. Keys include
placement kind, chain, board/community, wallet and page offset. Decimal amounts,
pagination, moderation, views, themes and SDK wallet adapters keep their existing
contracts. Optional `freshness` metadata uses epoch milliseconds. Public snapshots
are fresh for 30 seconds with at most 300 additional stale seconds; wallet
snapshots use 20 seconds plus 60 stale seconds. `/community` also caches its
display-only integration/revenue result. Community permissions are read afresh;
preparation, simulations, quotes, signatures and receipt verification bypass the
display cache entirely.

The cache uses the existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` pair, a 65-second
distributed lease, fenced publication, a 15-second failure cooldown, and bounded
last-good fallback. A competing cold request returns 503 with Retry-After. There
is no persistent worker, detached promise or process-local production cache.
Missing production storage fails closed; local development without KV explicitly
runs uncached. Storage failures never trigger an uncoordinated RPC fallback.

Confirmed, exactly matched `/verify` receipts and completed/recovered admin
operations atomically advance a shared display generation. This intentionally
invalidates across placements: wrapping ETHx or changing a stream can affect the
same wallet's balance and runway on other boards. Receipt markers suppress replay
for seven days, matching the preparation verification window; expired namespaces
age out naturally. In-flight loaders can only publish into the old generation.
Invalidation storage failures are retryable by verifying the same receipt or
reading the saved admin operation again; never resubmit an already sent payment.
Unverified external transactions are reflected on the next TTL refresh.

Run `npm run test:sdk --prefix frontend` for cache concurrency/fencing/outage tests
and mocked-chain sale/rent, wallet, permission and receipt invalidation coverage.
No deployment, npm publication or live transaction is performed by these tests.

- Configure the deployed Markee backend with its existing database, authorized routers/keeper and provider credentials, then run a staging acceptance pass. No production deployment or npm publication is implied by these code changes.
- Outbound bridge providers are wired to the existing quote/execute paths with status normalization. No live cross-chain treasury transfer was performed during implementation; validate each enabled route in staging before production rollout. Sources: [Across API authentication](https://docs.across.to/api-reference), [Across deposit status](https://docs.across.to/api-reference/deposit/status/get), [LI.FI transfer status](https://docs.li.fi/api-reference/check-the-status-of-a-cross-chain-transfer).
- Milestone 5: hosted wallet/login and card popup, including the Stripe feasibility/recipient flow. Milestone 6: incoming cross-chain funding. Milestone 7: production Gardens migration, broader wallet compatibility and npm release.
- Direct SDK transactions currently require an EIP-1193 on-chain hash with the connected account as sender. UserOperation-only/relayed transaction submission is not enabled. ERC-1271 community authorization is supported separately.
