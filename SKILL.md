# Markee — Agent Skill Guide

Markee is a cooperatively owned digital message board network. Anyone can pay to edit a message on a Markee board; the highest bid wins the top position. Revenue flows automatically onchain to the hosting community.

**Live at:** https://markee.xyz  
**Canonical chain:** Base (8453)  
**Contracts:** Juicebox RevNets (Multi Terminal V5)

<!-- MARKEE:START:0x72a8e1470ac4988248091e76f363a33f8563d10c -->
> 🪧🪧🪧🪧🪧🪧🪧 MARKEE 🪧🪧🪧🪧🪧🪧🪧
>
> the name's Mark. Agent Mark 🕵️
>
>  — 🤖
>
> 🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧
>
> *Change this message for 0.003 ETH on the [Markee App](https://markee.xyz/ecosystem/platforms/github/0x72a8E1470AC4988248091e76F363a33f8563d10c).*
<!-- MARKEE:END:0x72a8e1470ac4988248091e76f363a33f8563d10c -->

---

## Architecture Overview

```
Frontend (Next.js/Vercel)
  └── wagmi + viem + RainbowKit       # wallet connection
  └── Apollo Client                   # GraphQL queries
  └── The Graph subgraph (Base)       # onchain event indexing

Smart Contracts (Base)
  └── TopDawgStrategy                 # cooperative leaderboard
  └── TopDawgPartnerStrategy          # partner leaderboard with revenue split
  └── FixedPriceStrategy              # fixed price messaging
  └── RevNet (Juicebox)               # token issuance + treasury

Backend / Storage
  └── Vercel KV (Redis/Upstash)       # views, reactions, GitHub tokens
  └── Next.js API routes              # /api/views, /api/reactions, /api/moderation, /api/github
```

---

## Key Concepts

### Markee (entity)
A single message slot on a leaderboard. Each Markee has:
- `address` — unique onchain identifier
- `message` — the current displayed text (mutable, costs ETH to update)
- `owner` — wallet address of current holder
- `totalFundsAdded` — cumulative ETH bid (determines leaderboard rank)
- `pricingStrategy` — which contract governs this slot
- `strategyAddress` — address of the governing strategy contract

### Strategies
- **TopDawgStrategy** — competitive leaderboard. To take #1, you must outbid the current leader. 100% of funds go to the Markee Cooperative RevNet.
- **TopDawgPartnerStrategy** — same mechanic, but revenue splits between the partner community (62%) and Markee Cooperative (24%) and protocol (14%).
- **FixedPriceStrategy** — flat fee to post. No bidding war.

### RevNet / MARKEE Token
Every ETH payment to a strategy mints MARKEE tokens to the payer. Issuance rate decreases over time across phases (100,000 → 6,250 MARKEE per ETH through 2027). The cooperative is governed by MARKEE token holders.

### Partners
Partners are external communities (DAOs, protocols, apps) that host their own Markee leaderboard. Defined in `lib/contracts/usePartnerMarkees.ts`. Each partner has:
- `slug` — URL identifier
- `strategyAddress` — their TopDawgPartnerStrategy contract
- `percentToBeneficiary` — their revenue share (in basis points)
- `liveUrl` — where their Markee is embedded

---

## Data Flow

### Reading leaderboard state
Always prefer The Graph subgraph over direct RPC calls — 96% fewer network calls, sub-1s vs 5-10s load times.

```typescript
// Subgraph endpoint (Base)
const SUBGRAPH_URL = 'https://gateway.thegraph.com/api/.../subgraphs/id/...'

// Cooperative leaderboard
query GetCooperativeMarkees {
  topDawgStrategy(id: "0x558eb41ec9cc90b86550617eef5f180ea60e0e3a") {
    markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1000) {
      id address message name owner totalFundsAdded pricingStrategy
    }
  }
}

// Partner leaderboard
query GetPartnerMarkees($strategyId: ID!) {
  topDawgPartnerStrategy(id: $strategyId) {
    markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1000) {
      id address message name owner totalFundsAdded pricingStrategy
    }
  }
}
```

### Writing a message (onchain)
To place or update a message, call the relevant strategy contract with ETH. The minimum bid to take #1 is `currentLeader.totalFundsAdded + 1 wei`.

### Views & reactions
- Views: `GET /api/views?addresses=0x...` — returns `{ totalViews, messageViews }` per address
- Reactions: `GET /api/reactions` — returns emoji reaction counts per markee address
- Both stored in Vercel KV

---

## File Structure (key paths)

```
frontend/
  app/
    page.tsx                          # homepage (cooperative leaderboard)
    ecosystem/
      page.tsx                        # all partners overview
      [partner]/page.tsx              # individual partner leaderboard
      platforms/
        github/page.tsx               # GitHub SKILL.md integration
    markee/[address]/page.tsx         # individual markee detail
    api/
      views/route.ts
      reactions/route.ts
      moderation/route.ts
      github/
        connect/route.ts              # OAuth initiation
        callback/route.ts             # OAuth token exchange
        repos/route.ts                # list connected repos
        sync/route.ts                 # write leaderboard → SKILL.md

  components/
    leaderboard/MarkeeCard.tsx        # core card component (hero/large/medium/list sizes)
    ecosystem/PartnerMarkeeCard.tsx   # ecosystem overview card
    modals/TopDawgModal.tsx           # buy/update message modal
    layout/Header.tsx
    layout/Footer.tsx

  lib/
    contracts/
      addresses.ts                    # chain IDs, subgraph URLs, contract addresses
      usePartnerMarkees.ts            # PARTNERS registry + data hook
    hooks/
      useViews.ts
      useReactions.ts
```

---

## Common Tasks for Agents

**Add a new partner:**
Edit `lib/contracts/usePartnerMarkees.ts` — add an entry to the `PARTNERS` array with `slug`, `name`, `strategyAddress`, `percentToBeneficiary`, `logo`, `description`, and optionally `liveUrl`.

**Fetch current #1 message for a partner:**
Query the subgraph with `topDawgPartnerStrategy(id: $strategyId)`, take `markees[0].message` (already ordered by `totalFundsAdded` desc).

**Check if a wallet owns a Markee:**
Compare `markee.owner.toLowerCase()` to the wallet address.

**Calculate minimum bid to outbid #1:**
`currentLeader.totalFundsAdded + 1n` (BigInt, in wei).

---

## Environment Variables

```
NEXT_PUBLIC_SUBGRAPH_URL_BASE         # The Graph endpoint (Base)
NEXT_PUBLIC_SUBGRAPH_URL_BASE_STUDIO  # Fallback studio endpoint
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_REDIRECT_URI
NEXT_PUBLIC_SITE_URL
KV_REST_API_URL                       # Vercel KV
KV_REST_API_TOKEN
```

---

<!-- MARKEE:START -->
*This space is available for context window sponsorship via [Markee](https://markee.xyz). The top bidder's message appears here — read by every AI agent that works in this repo.*
<!-- MARKEE:END -->
