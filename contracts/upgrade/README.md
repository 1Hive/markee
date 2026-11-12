# Board upgrades and forced migration

Every board is an EIP-1167 clone. Clones created from a `BeaconForwarder` delegate to the forwarder, and the forwarder delegates to whatever implementation its beacon routes to, all in the board's own storage. The Coop multisig can therefore fix every board of a family in one transaction, and stop money flowing into any of them instantly.

## Pieces

| Contract | Role |
|---|---|
| `BoardBeacon` | Implementation pointer, timelocked upgrades, selector-level pause. |
| `StreamingBoardBeacon` | Beacon for streaming boards. Checks HOST and ETHx on every implementation and refuses to make termination callbacks or `withdrawDeposit` pausable. |
| `LeaderboardBeacon` | Beacon for lump-sum boards. |
| `BeaconForwarder` | Installed as a factory's `leaderboardImplementation`. Boards answer `boardBeacon()`. |
| `v1.4/LeaderboardFactory` | v1.3 factory with injected implementations and a migrator-only creation path. |
| `StreamingBoardMigrator`, `LeaderboardMigrator` | Copy a legacy board into a beacon-backed successor without the legacy admin. |
| `SunsetTerminal` | Freezes payments on a fully migrated v1.3 factory. |

## Roles

- Admin (Coop multisig). Schedules upgrades and guardian changes, pauses and unpauses, sets pausable selectors.
- Guardian (fast key). Pauses, and cancels a scheduled upgrade or guardian change. It cannot unpause or upgrade, and can resign.
- Operator (hot key). Runs migrations. Everything a migration writes is read from the legacy board and its own Markees, so the operator cannot change what is copied, pick a successor's admin, or finish with a Markee left out.
- Migrator owner (Coop multisig). Approves source factories and, for streaming, the legacy implementation boards must be cloned from. Excludes a legacy Markee that cannot be read or copied.

Only the migrator can import Markees into a board (`registerExistingMarkees` on streaming, `migrateFromLegacy` and `initializeHistory` on lump-sum). Streaming boards hold the migrator as an implementation immutable, so replacing it is a timelocked upgrade. Lump-sum boards read it from their v1.4 factory.

Upgrades and guardian changes wait `UPGRADE_DELAY` (2 days), so a compromised admin cannot swap the guardian and push logic through unopposed. A pause covers that window, so the delay never holds back a response. Implementations must keep storage append-only, and a beacon refuses the forwarder or itself as an implementation.

## Pausable entry points

| Family | Pausable | Always open |
|---|---|---|
| Streaming | `createMarkee`, `depositBuffer`, `claimTop`, `settle`, `afterAgreementCreated`, `afterAgreementUpdated` | stream deletion, `withdrawDeposit`, edits, admin calls |
| Lump-sum | `createMarkee`, `addFunds` | edits, admin calls |

Streaming forwarders accept plain ETH without asking the beacon, because `ETHx.downgradeToETH` pays the board with a 2300-gas stipend that a beacon lookup would exceed.

## Rollout

1. Merge and deploy the reviewed release, then deploy contracts with `script/DeployBoardBeacons.s.sol` (`GUARDIAN`, `OPERATOR` env). Record the broadcast addresses and verify deployed code, constructor parameters, pending ownership/admin, and operator permissions on Base.
2. Propose a Coop Safe batch targeting the verified deployed addresses: `setImplementations(streamingForwarder, markeeImplementation)` on the streaming factory 0x37f420fdE5c98e611EB7cb9b74ef579D84697039, `acceptOwnership()` on the streaming migrator and four lump-sum migrators, and `acceptFactoryAdmin()` on the four v1.4 factories. Simulate the batch before collecting Safe signatures. The streaming factory keeps its Superfluid registration, so no new governance request is needed.
3. Point the frontend's create flow at the four v1.4 factories.
4. Migrate lump-sum factories one at a time. Immediately before copying boards from a factory, the Coop sets its `revNetTerminal` to that factory's `SunsetTerminal` with `revNetEnabled` true. This stops new payments to legacy boards while they are copied. Migration only reads, so it still works on a frozen factory. Do not freeze all four factories in the initial Safe batch: payments to their legacy boards would revert throughout the remaining migration.
5. Operator migrates every legacy board, with `migrate(board)` for small boards and `startMigration`, `importMarkees(board, offset, limit)` pages, then `finishMigration` for any board whose one-shot migration would exceed the per-transaction gas budget. The heaviest live boards take about 28.2M gas (lump-sum) and 12.9M gas (streaming) in one shot.
   `finishMigration` reverts with `MarkeeNotCopied` until every legacy Markee is copied, owned by another board, an empty seed, or excluded by the owner.
6. Frontend and indexers follow `BoardMigrated(legacy, successor, admin)` and `MarkeeCopied(legacyBoard, legacyMarkee, successorMarkee, total)` (also `successorOf`, `markeeSuccessorOf`) to redirect board and Markee addresses, KV keys and SDK lookups.

Payments on a sunset factory revert with `BoardSunset(migrator)`. Message edits on legacy boards stay possible and do not reach the successor, so the frontend must stop offering them.

Legacy streaming boards cannot be frozen on-chain. Open streams and deposits stay on them until backers close and withdraw, and the frontend must stop offering them. Copied Markees keep their carried `totalFundsAdded` as a grandfather floor on the successor. Natively streamed rank does not carry over. Streaming successors use the factory's default message and name lengths, since boards have no setter for them, and take floor grace and decay from the migrator, with floors recaptured on a fresh clock.

### Operator wallet

Deploy with `OPERATOR=0x9fcbc092b770970a58524136ef6202ca2caa0d73` to authorize the Foundry `MARKEE_GNOSIS_DELIVERY` keystore on all five migrators. The Safe remains the migrator owner. After deployment, generate the operator config and five Safe Transaction Builder batches from the confirmed Foundry broadcast receipts:

```bash
python3 scripts/prepare-board-rollout.py broadcast/DeployBoardBeacons.s.sol/8453/run-latest.json --out-dir broadcast/board-rollout
```

The generator rejects dry-run or failed receipts and checks the operator and Safe handoff calls. Import `safe-handoff.json` after independently verifying the deployed code, constructor parameters, and pending ownership. Import each `safe-freeze-*.json` only immediately before migrating that factory. The example config intentionally has empty target addresses and cannot execute until the confirmed broadcast produces them.

After the Safe executes the handoff batch, set `BASE_RPC_URL` and preview one factory with:

```bash
python3 scripts/operate-board-migration.py --config broadcast/board-rollout/board-migration.base.json --factory streaming
```

For each lump-sum factory, the Safe must first set its legacy `revNetTerminal` to that factory's SunsetTerminal and keep `revNetEnabled` true. Preview it, then add `--execute --max-boards 1` for a canary before running the rest without `--max-boards`. The command uses the configured `MARKEE_GNOSIS_DELIVERY` Foundry keystore and `KEYSTORE_PASSWORD` environment variable (`--password-env` can select another variable name). It checks the chain, Safe ownership, operator role, source factory, forwarder or sunset configuration, and transaction gas before each write. It skips finished boards and resumes importing boards after interruption. It caps one-shot estimates at 14M gas and imports in pages of at most 20. Run the factories sequentially; verify resulting successor addresses and frontend/indexer routing before moving to the next factory.

`test/ForcedMigrationFork.t.sol` dry-runs steps 2 and 5 against every live board on Base.
