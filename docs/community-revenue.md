# Platform-neutral community revenue

The bridge/vault route below is retained for historical tests and the unmigrated Gardens pilot. **New SDK `multiBoard` activation uses the direct Base beneficiary route** in [direct-platform-boards.md](direct-platform-boards.md). Do not use this bridge deployment procedure to enable `multiBoard`.

Status: local implementation and tests, **not deployed and not connected to the production keeper**. Existing Gardens routing is unchanged. This is not an audit certification. The generic SDK activation path requires the registrar, destination receiver, operator, and platform contracts to be configured before use; a locally passing test is not a live payout.

## Boundaries

Base leaderboard → community vault → revenue router → selected bridge → destination receiver → platform adapter.

`CommunityBoardRegistrar` creates one For Sale or For Rent board per platform, destination chain, and community ID, after Markee's API verifies a five-minute community-owner signature. Its operator is the Markee service wallet, not a host-app wallet. The registrar checks that a destination receiver is configured before creating a board. A live cross-chain route still needs a separate bridge/receiver preflight. The board is administered by the registrar; governance must define any future board-admin operation deliberately rather than transferring the vault beneficiary to a community wallet.

- The **vault** accepts the beneficiary stream and normalizes ETHx/WETH to ETH on Base. An exact quoted amount is withdrawn; later streaming growth stays in the vault.
- The **router** registers immutable identities `(platformId, destinationChainId, communityId)` via a platform registrar, authorizes keepers, bounds reimbursements/loss and selects an owner-approved route. `nextPayoutId(key)` must be read immediately before quoting. A concurrent sweep invalidates the quote instead of changing its destination message.
- The **bridge adapters** implement transport only. They cannot decide which community a vault represents. Across and LI.FI validate supported route fields. Squid uses an additional trusted EIP-712/EIP-1271 route approver for its arbitrary call bundles; the keeper cannot edit an approved bundle.
- The **receiver** authenticates local routers / bridge dispatchers, accounts for funded receipts, and keeps failed deliveries in escrow. Anyone may retry. Only its owner may recover pending funds or unallocated surplus. The owner is consequently a trusted custody and upgrade authority, not a trustless role.
- A **platform adapter** implements `transferToCommunity(communityId, receiptId, token, amount)`. Only the configured receiver may call it. Tokens use a temporary, exact allowance cleared after delivery; failed delivery rolls the entire subcall back. `token == address(0)` means native ETH, not the native gas asset of every chain.

The receiver, router and platform adapters use UUPS proxies with two-step ownership. Vaults are deterministic immutable clones. Bridge adapters are replaceable, owner-configured non-proxy contracts. No existing proxy can safely be upgraded directly to these implementations: these are new layouts and new message formats.

## Platform strategies

### Gardens

`platformId = keccak256("gardens")`; `communityId = bytes32(uint256(uint160(registryCommunity)))`.

The entire strategy is: read `RegistryCommunity.councilSafe()` **at transfer time**, then send the asset to that Safe. There is no cached beneficiary, council proof system, or second community-to-Safe registry. A retry reads the Safe again. The community contract on the destination chain remains the authority for council updates.

For Gnosis, bridged ETH is WETH (`0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1`). It is transferred as WETH; it must not be unwrapped into xDAI. Configure `nativeEnabled=false` and `setAsset(WETH, true, false)`. The same native-asset distinction applies to Polygon and Celo. On ETH-native chains a canonical WETH wrapper may be explicitly enabled with `unwrap=true`.

### Revnet

`platformId = keccak256("revnet")`; `communityId = bytes32(projectId)`.

The adapter resolves `JBDirectory.primaryTerminalOf(projectId, 0x…EEEe)` on every transfer, checks that it is a registered terminal, and calls:

```solidity
terminal.addToBalanceOf{value: amount}(
    projectId, nativeToken, amount, false, "Markee community revenue", ""
);
```

This credits the project's terminal balance. It is **not** a plain ETH transfer and **not** `pay` / a token purchase. The current adapter accepts native ETH only, so enable it only on ETH-native chains. `shouldReturnHeldFees=false` avoids an incidental held-fee refund action.

Markee's API resolves the v6 project owner and its current native-token terminal from configured Projects, Permissions and Directory contracts. This code is gated on verified v6 deployment addresses and an explicit admin permission ID. Neither those live addresses nor a production project route have been validated for this branch, so Revnet activation and payout are not enabled.

### Giveth Projects design test

`contracts/revenue/prototypes/GivethProjectAdapter.sol` and the API-side injected `givethProjectPrototype` use mocked Project ID, owner and Base-recipient data. Tests cover owner changes, recipient changes, upstream failure, escrow and retry. The prototype is not included in the public placement union or deployment script. Sending ETH to its configured Base wallet is not a Giveth donation and must not be represented as one.

## Bridge guarantees and limitations

| Transport | Checked by this code | Remaining operational requirement |
| --- | --- | --- |
| Across | pinned spoke/token, receiver, identity, refund vault, amount, deadline, minimum output | verify route availability on both chains; Across must support the destination |
| LI.FI / Stargate V2 | exact supported selector; source fee call; chain and LayerZero endpoint; asset, executor, options hash, refund; exact destination callback | live provider quote must match this deliberately narrow shape; options must fund enough destination gas |
| Squid | pinned router; complete request + calldata + output + value + expiry signed under this chain/adapter domain; one-time digest | a separate trusted reviewer must inspect **all** calls, destination payload and refunds before signing; signatures do not independently prove swap semantics |

Never auto-sign provider responses. Do not enable Squid until the route-review/signing process is in place. A provider's quoted minimum is not proof of the actual delivery. Owner-approved provider contracts, token semantics and route parameters remain trust assumptions.

Shared Squid/LI.FI dispatchers do not authenticate the original source router. Each funded remote callback gets a receiver-local nonce ID; the source payout ID is correlation data. This prevents an attacker from pre-consuming a legitimate source ID with a dust transfer. Repeated callbacks must supply new funds and cannot consume existing escrow. Local authenticated routers reject source-ID replay. Across callbacks additionally require unreserved prefunded tokens; only its canonical spoke may invoke them.

LI.FI destination residuals stay at the receiver, not at a source-chain-only vault address. They are **not automatically credited**: reconcile provider events and use owner-only `recoverSurplus` to send residuals to the intended community. That function cannot spend escrow. The fixed minimum-amount callback is conservative; automated actual-output reconciliation remains keeper work.

## Delivery, retries and pause

- `RevenueSwept` / `BridgeStarted` means submitted, **not delivered**. Track `RevenueReceived`, then `PayoutDelivered` or `PayoutEscrowed` on the destination.
- Callback delivery is gas-bounded and leaves a reserve for escrow. Quote enough destination gas (start with 650,000 for standard Gardens delivery and simulate); complex Safes/adapters may need more. Very low supplied gas can still revert the entire callback before escrow is recorded; use the provider's retry/recovery path in that case.
- Pause new source payouts by disabling its keeper/bridge/receiver. Pause platform delivery by setting the platform adapter to zero; receipts remain pending. Disabling a destination executor too early may prevent already-in-flight deposits; first reconcile in-flight routes.
- Retry failed receipts after fixing the destination. A failed retry leaves funds and status unchanged. Governance recovery is a last resort and must be reconciled to the community manually.
- Only configure standard ETH-equivalent tokens with known semantics. Fee-on-transfer or rebasing tokens are not supported.

## Validation

```bash
npm ci --ignore-scripts --no-audit --no-fund
git submodule update --init lib/forge-std
npm run test:revenue
npm run check:revenue-layout
forge fmt --check contracts/revenue test/revenue script/revenue
forge build --skip test
git diff --check
```

The revenue profile uses Solidity 0.8.30 for OpenZeppelin 5.6.1 proxies, while the legacy contract profile stays on 0.8.23. Revenue paths are excluded from the legacy profile. The layout check fingerprints full nested layouts and the namespaced OpenZeppelin storage sources. Any layout change needs a reviewed migration, not automatic baseline regeneration.

Optional, pinned-block fork tests (these do not send live transactions):

```bash
FOUNDRY_PROFILE=revenue \
REVENUE_GNOSIS_FORK_RPC=https://rpc.gnosischain.com \
REVENUE_BASE_FORK_RPC=https://mainnet.base.org \
forge test --match-contract PilotForkTest -vv
```

Default blocks are Gnosis `48791917` and Base `52696559` (2026-10-16). Override `REVENUE_GNOSIS_FORK_BLOCK` / `REVENUE_BASE_FORK_BLOCK` for fresh-state checks. CI runs deterministic unit/fuzz/invariant tests and skips RPC tests unless configured. Mocks validate bridge parsing, not a real cross-chain bridge completion.

Local validation on 2026-10-16: all 39 revenue tests passed, including both fork tests and two stateful invariants (128 runs × 64 calls each); all 65 existing streaming-leaderboard tests passed against their pinned Base fork. Formatting, storage-layout checks and `git diff --check` passed. No hosted CI or live bridge transfer has been run for this branch.

Current branch validation on 2026-11-16: 40 deterministic revenue tests passed; two opt-in fork tests passed at Gnosis block `49319243` and Base block `58464687`. The Gardens router's 38 targeted tests and its separate fork migration simulation passed. The API suite passed 49 SDK tests and 100 moderation tests; the SDK passed 55 tests and built. Frontend typecheck and a build using the local valid Privy app ID passed. No actual bridge transfer or deployment has been performed. Published alpha.22 and beta.8 artifacts reached the changed local API for `checkout/config`; sale snapshots returned `MODERATION_UNAVAILABLE` because the local moderation KV was unavailable, so the required full compatibility matrix (sale/rent, wallet, transaction recovery) remains unverified.

## Deployment preparation

Use `script/revenue/DeployRevenue.s.sol` for **new** proxies only. Dry-run first without `--broadcast`:

```bash
FOUNDRY_PROFILE=revenue forge script script/revenue/DeployRevenue.s.sol:DeployRevenue \
  --sig 'deploySource()' --rpc-url <Base RPC> --account <reviewed-deployer>

FOUNDRY_PROFILE=revenue forge script script/revenue/DeployRevenue.s.sol:DeployRevenue \
  --sig 'deployDestination()' --rpc-url <destination RPC> --account <reviewed-deployer>
```

Required inputs: `REVENUE_CHAIN_ID`, `REVENUE_OWNER`. Source additionally requires `REVENUE_ETHX`, `REVENUE_WETH`, `REVENUE_SALE_FACTORY`, and `REVENUE_RENT_FACTORY`. Destination requires `REVENUE_NATIVE_ETH` and optionally `REVENUE_JB_DIRECTORY` (omit for Gardens-only). Supply credentials via the local keystore, never committed config or chat. Add `--broadcast` only after the dry-run, ownership, balance, nonce and migration review.

The script does **not** enable routes or transfer ownership through a temporary deployer. Proxies are initialized atomically to `REVENUE_OWNER`, and start with no keeper, registrar, operator, executor or platform adapter authorized. Record all proxy **and implementation** addresses and deployment receipts before enabling anything. The API requires `MARKEE_GENERIC_REGISTRAR_ADDRESS_BASE` and `MARKEE_GENERIC_OPERATOR_PRIVATE_KEY_BASE`; the latter is a server-only secret. Gardens also requires a verified `MARKEE_GARDENS_REGISTRY_FACTORY_<chainId>`; Markee checks `getCommunityValidity` before accepting an owner or treasury. Revnet requires verified `MARKEE_REVNET_V6_PROJECTS_<chainId>`, `MARKEE_REVNET_V6_PERMISSIONS_<chainId>`, `MARKEE_REVNET_V6_DIRECTORY_<chainId>` and `MARKEE_REVNET_V6_ADMIN_PERMISSION_ID`. Do not set these from guesses.

Owner configuration, in order:

1. Destination: register the Gardens adapter; enable the exact chain's WETH token and canonical dispatcher(s); use native ETH only on ETH-native chains.
2. Source: deploy the selected bridge adapter bound to the new router, pin its source/destination protocol contracts and tokens, and review a current provider quote. The adapter owner must be the intended governance authority.
3. Source: configure platform registrar, destination receiver, route and conservative fee caps. `prepareExistingVault` registers the pilot identity and creates its deterministic vault; verify the predicted and deployed addresses match.
4. Upgrade the legacy Gardens router only after its source, storage layout, owner and upgrade authority are verified. Its `migrateGnosisPilotBeneficiary` is restricted to the documented Gnosis board and checks the new router's registered identity, vault, receiver and Across bridge before redirecting the live stream. Confirm the old vault remains claimable and the board now points to the new vault. Then call registrar `adoptExistingBoard`, which verifies the board, factory, seed message and beneficiary. Do not call `createBoard` for the existing board.
5. Enable the dedicated keeper only after a bounded pilot transfer has been simulated. Re-quote immediately before sending, correlate source and destination events, verify the **current** council Safe's balance, and test retry/pause procedures.

Before production: integrate the new quote/message schema and receipt monitoring into the keeper, complete bridge end-to-end staging checks, establish quote approval for Squid if used, review escrow recovery ownership, and obtain an independent contract review.

## Gardens pilot preflight (read-only, 2026-10-16)

- Community, Gnosis: `0xE2396fe2169ca026962971d3B2E373Ba925B6257`
- Registry factory, Gnosis: `0x08df82f74d1f56f650e98da2dd4240f1a31711bc` (`getCommunityValidity` returned true on 2026-11-16)
- Current council Safe: `0xc6c2E9EFB898A42DB4137B07b727b45e0C353d81`
- Current leaderboard, Base: `0x5B9eF23a155Fd97d29fa463af824cFA53C4FAA11`
- Current beneficiary vault, Base: `0xb7Ea02d34772F9Eeb0A6e270b0D9eB6804b70eDC`
- Current leaderboard admin / Gardens router: `0xa9d9b3a9CE7edA7000A4baD8Af0863F716eA9d30`
- Current Gardens router owner: `0x00BcC26E792E393217bA895f5e85AE628FC994E9` (no bytecode on Base at the checked block; do not label it a Safe).

The existing deployed router has no exposed leaderboard-beneficiary migration method. An isolated Gardens worktree contains a narrowly scoped extension; a fork simulation at Base block `58464687` upgraded the proxy and redirected this exact board while preserving the old vault address and native balance. The proxy has **not** been upgraded live. Keep the old vault drainable for accrued balances, coordinate source keeper/UI bookkeeping, and preserve all unrelated communities. The read-only 2026-11-16 recheck found the same Safe, board admin and old beneficiary; the old vault reported 2,831,050,212 wei of available revenue. New-router ownership, deployed route addresses, live bridge liquidity, and migration authority remain unresolved. No live pilot transaction has been sent.
