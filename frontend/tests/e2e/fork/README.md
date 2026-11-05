# Fork E2E tests

End-to-end tests that make real transactions through the app's own modals, without anyone signing
anything:

- **Chain:** [Anvil](https://book.getfoundry.sh/anvil/) forks Base at a pinned block
  (`E2E_FORK_BLOCK`, default in `env.ts`). Real contracts, real Superfluid, local state only.
- **Wallet:** with `NEXT_PUBLIC_E2E=1`, `next.config.js` swaps `@privy-io/react-auth` and
  `@privy-io/wagmi` for the stubs in `stubs/`: plain wagmi with a `mock` connector for Anvil's first
  default account, auto-connected. Anvil signs its transactions and messages.
- **KV:** Redis behind `serverless-redis-http` (Upstash REST protocol) via `docker-compose.yml`.
- Every run starts from the same chain state and an empty KV (`global-setup.ts`): it reverts Anvil to
  a snapshot of the pinned block (keeping the state Anvil has already fetched warm) and flushes KV.
  On a fresh Anvil it resets to the pinned block, simulates a purchase once to warm the cache, and
  takes that snapshot.

## Running

Needs Docker, Foundry (`anvil`), and a Base RPC that serves historical state: `ALCHEMY_BASE_URL` in
`.env.local`, or `E2E_FORK_RPC_URL`.

```bash
npm run test:e2e:fork             # starts Anvil, Redis/SRH and `next dev -p 3100` (.next-e2e)
npm run test:e2e:fork -- smoke    # one file
```

Outside CI Playwright reuses servers that are already running, so leaving Anvil, the KV containers
and the E2E dev server up makes reruns fast. The E2E server builds into `.next-e2e`, so it can run
beside your normal `npm run dev`.

## Things to know

- **A fresh fork is slow** (tens of seconds to minutes for the first purchase): Anvil fetches every
  storage slot it touches from the upstream RPC, at whatever speed that RPC allows. The global setup
  absorbs this once; keeping Anvil running between runs (the default outside CI) keeps it warm.
  Tests allow 150s per transaction and per first Buyer Hub load.
- **Anvil's default account exists on Base too**, so on the fork it carries whatever mainnet state it
  had at the pinned block (e.g. a MARKEE balance). Assertions only look for what the tests create.
- **Indexers don't see fork transactions.** The Superfluid streaming subgraph and The Graph index real
  Base, so values that come only from them (e.g. a Rent bid's current flow rate in
  `/api/account/messages` and `/funded`) read as zero/missing for anything created in a test.
- Bumping `E2E_FORK_BLOCK` can change which boards exist and who is winning; the boards in
  `buyer-hub.spec.ts` are chosen for the default block.


## RPC usage and cache lifecycle

Only Anvil needs the external archive RPC. The app and mock wallet use local
Anvil; `MARKEE_RPC_8453` is explicitly local too. `tests/e2e/fork/server.mjs` forwards
upstream reads through a loopback proxy with at most four requests in flight.
It records method counts and HTTP statuses in `test-results/fork-rpc-counts.json`,
without URLs, credentials, addresses, or request payloads. CI uploads that report.

The wrapper translates shutdown into SIGINT so Anvil flushes its storage cache
under `~/.foundry/cache/rpc`. `--cache-path` controls historical state caching,
not this upstream storage cache. CI restores the latest cache for the pinned
block and saves a new run-specific key, including after test failures. It does
not save metadata-only directories under 4 KiB. Cancelled runs may not save.

A new Anvil process is already at the pinned block. Setup does not reset it:
`anvil_reset` discards restored storage. Subsequent local runs use snapshot/revert.
The wrapper writes `.anvil-instance` so setup can distinguish a new fork from a
reused process. If a reused process has lost its snapshot, stop that E2E fork
and let Playwright restart it rather than silently testing against dirty state.

`node --test tests/fork-cache.test.mjs` verifies cold/warm cache reuse against
another local Anvil chain, with no external RPC. It skips if Anvil is absent.
It is also run in the fork CI job with that job's pinned Foundry version.
