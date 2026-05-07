# Markee: Interim-to-RevNet-v6 Migration Guide

This document captures the current migration state across all three Markee platforms and the checklist for completing the RevNet v6 activation once that contract is live.

---

## Architecture overview

Every v1.1 `Leaderboard` contract acts as the single pricing-strategy for all connected `Markee` proxies. Payment routing parameters (`beneficiaryAddress`, `percentToBeneficiary`, `revNetEnabled`, `revNetTerminal`, `revNetProjectId`, `platformFeeReceiver`) are read dynamically by each Markee at pay-time. Changing any parameter on the Leaderboard propagates instantly to every connected Markee — no per-Markee updates ever needed.

**Interim default** (RevNet v5 winding down): `revNetEnabled = false`, `percentToBeneficiary = 10000` (100% to beneficiary). RevNet calls are skipped; all ETH goes to the beneficiary address.

---

## Platform migration status

### OpenInternet (Website)

| Factory | Address | Status |
|---|---|---|
| v1.1 (active) | `0x3f9f7C070f03167C0A90Ee7C2c5863d6F15F7E6D` | ✅ in use |
| v1.1 (legacy OI) | `0xb9922E2bdbA79190F0da51Fe362297Ef214eD254` | legacy — Coop/Gardens/Clawchemy |

**Active leaderboards** (new factory): Honeyswap, NORD, Gitcoin, Mati's Markee, OwnerSyncSafe, Hello!

**Legacy leaderboards** (old factory `0xb9922E...`): Markee Cooperative, Gardens, Clawchemy
- Markees were migrated from v0.1 TopDawg → v1.1 via `migrateFromLegacy()` (19 total: 10 Coop + 7 Gardens + 2 Clawchemy)
- Admin transferred to Coop multisig `0xAf4401E765dFf079aB6021BBb8d46E53E27613DB` on 2026-05-05
- Served in frontend via `LEGACY_PARTNERS` array (subgraph, not RPC) with their v0.1 TopDawg strategy addresses

**Remaining OI work:**
- [ ] Set `oi:meta:{address}` KV entries for Mati's Markee (`0xb908BBf13D933499Aa3cD6b7b0b4F55b085Aff1e`), OwnerSyncSafe (`0xd033038dae385c46438E6bdC216AefBEF636EC97`), Hello! (`0x1DBcb065f73859FFa7527E775498BadBe5c515B7`) — currently show as `status: pending` with no logo/siteUrl

---

### GitHub

| Factory | Address | Status |
|---|---|---|
| v1.1 (active) | `0xb1E2dC9582810124Fed3Cdb4B8Bb944A5495D85a` | ✅ fully migrated |

No pending work.

---

### Superfluid

| Factory | Address | Status |
|---|---|---|
| v1.0 (active) | `0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d` | 94 leaderboards, v1.1 migration pending |
| TopDawg strategy (legacy) | `0x7A6CE4d457AC1A31513BDEFf924FF942150D293E` | LEGACY_PARTNERS entry in frontend |

**Completed on 2026-05-05:**
- Deployed v1.1 Leaderboard proxy at `0xb6CCc63d3FdC2D22e3147c01AB6A006f32Dd7580`
  - Impl: `0x63BABD83834ED8Ed55Ab2212416fE38c27F1Cf81` (same as old OI factory — has `migrateFromLegacy`)
  - Beneficiary: `0xac808840f02c47C05507f48165d2222FF28EF4e1` (original Superfluid TopDawg beneficiary)
  - Platform fee receiver: Coop multisig `0xAf4401E765dFf079aB6021BBb8d46E53E27613DB`
- Ran `migrateFromLegacy()` for all 32 legacy Superfluid TopDawg markees ✓
- Transferred admin to Coop multisig ✓

**Remaining Superfluid work:**
- [ ] Wire `0xb6CCc63d3FdC2D22e3147c01AB6A006f32Dd7580` into the frontend Superfluid leaderboards API route

---

## RevNet v6 activation checklist

Run these `onlyAdmin` calls on **every active v1.1 Leaderboard** once RevNet v6 is deployed and the terminal/project ID are known:

```solidity
// 1. Wire the terminal and project ID
leaderboard.setRevNetTerminal(<revnet_v6_terminal_address>);
leaderboard.setRevNetProjectId(<revnet_v6_project_id>);

// 2. Restore the fund split (62% to RevNet buyer, 38% platform fee via RevNet)
leaderboard.setPercentToBeneficiary(6200);

// 3. Set the Coop multisig as the platform fee receiver (if not already set at deploy)
leaderboard.setPlatformFeeReceiver(0xAf4401E765dFf079aB6021BBb8d46E53E27613DB);

// 4. Enable RevNet routing — do this last
leaderboard.setRevNetEnabled(true);
```

**Important order:** set terminal, projectId, and percentToBeneficiary *before* calling `setRevNetEnabled(true)` — enabling it with stale/zero values would misroute payments.

### Leaderboards to update

All leaderboards across all three factories:

| Platform | Factory | Leaderboards |
|---|---|---|
| OpenInternet | `0x3f9f7C...` | Honeyswap, NORD, Gitcoin, Mati's Markee, OwnerSyncSafe, Hello! (+ any added later) |
| OpenInternet | `0xb9922E...` | Markee Cooperative, Gardens, Clawchemy |
| GitHub | `0xb1E2dC...` | all GitHub leaderboards |
| Superfluid | `0x45Ce642...` | all 94 Superfluid leaderboards |

---

## Pending ops

- [ ] **KV credential rotation** — `KV_REST_API_URL`/`KV_REST_API_TOKEN` were exposed in a prior session. Rotate via: Vercel dashboard → Storage → KV store → Settings → Regenerate token, then re-pull env vars with `vercel env pull`.
- [ ] **Superfluid v1.1 migration** — scan `0x7A6CE4...` for `MarkeeCreated` events, then `migrateFromLegacy()` for each, using the automation wallet.
- [ ] **OI KV meta** — populate `oi:meta:{address}` for Mati's Markee, OwnerSyncSafe, Hello! so they display logos and site URLs instead of `status: pending`.

---

## Key addresses

| Name | Address |
|---|---|
| Coop multisig (beneficiary / admin) | `0xAf4401E765dFf079aB6021BBb8d46E53E27613DB` |
| OI factory v1.1 (new) | `0x3f9f7C070f03167C0A90Ee7C2c5863d6F15F7E6D` |
| OI factory v1.1 (legacy Coop/Gardens/Clawchemy) | `0xb9922E2bdbA79190F0da51Fe362297Ef214eD254` |
| GitHub factory v1.1 | `0xb1E2dC9582810124Fed3Cdb4B8Bb944A5495D85a` |
| Superfluid factory v1.0 | `0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d` |
| Superfluid TopDawg strategy (legacy) | `0x7A6CE4d457AC1A31513BDEFf924FF942150D293E` |
