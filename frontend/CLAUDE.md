# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read [../AGENTS.md](../AGENTS.md) first. Its SDK/API compatibility and release
policy applies to all frontend API routes and integration prompts.

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

Targeted tests are configured in package.json. Run the relevant suites and TypeScript checks before delivery.

## Deployment

- All deploys happen via GitHub push to Vercel — there is no local dev environment in active use
- Run relevant tests before deploying; verify the resulting deployment and logs as well.
- `vercel.json` lives inside `frontend/` (matches Vercel's configured Root Directory)

## Key Principles

- Legacy TopDawg strategy contracts use The Graph subgraph as the authoritative data source
- V1.0 LeaderboardFactory contracts use direct RPC via Alchemy — this is the target pattern going forward
- Both must be supported during the transition; prefer RPC for new work
- Minimal diffs over rewrites — make targeted changes to working code, never wholesale replacements
- Fire-and-forget fetches from Vercel serverless functions are unreliable — use cron jobs or await fetches before returning
- Polling intervals must be set explicitly in wagmi config (`pollingInterval: 120_000`) to avoid RPC rate limiting
- Copy-pasting complete files can introduce invisible characters — incremental edits to existing files are safer

## Architecture

**Next.js 15 App Router** (React 19) frontend for the Markee protocol — a leaderboard of on-chain "markees" (smart contracts) ranked by total funds added.

### Routing

- `/` — Leaderboard home (client component)
- `/markee/[address]` — Individual markee detail
- `/ecosystem` + `/ecosystem/[partner]` — Partner showcase
- `/how-it-works`, `/owners` — Static pages
- `/api/reactions`, `/api/views`, `/api/moderation` — Internal REST endpoints backed by Vercel KV (Redis)
- `/api/cron/superfluid-points` — Hourly Vercel cron for Superfluid S5 rewards

### Data Flow

**Markee leaderboard data** has two sources depending on contract version:

- **Legacy TopDawg contracts**: The Graph subgraph via Apollo Client (`lib/apollo-client.ts`). Main query (`GetMarkees`) polls every 30 seconds with `network-only` fetch policy. Two environments: Studio (dev) and decentralized network (prod).
- **V1.0 LeaderboardFactory contracts**: Direct RPC via Alchemy using viem. This is the preferred pattern for new work.

Hooks for both live in `lib/contracts/` (e.g., `useMarkees.ts`, `useMarkeeDetail.ts`, `useFixedMarkees.ts`).

**On-chain reads** use viem `createPublicClient` against Base (canonical chain). Cross-chain payment support exists for Optimism, Arbitrum, and Mainnet via RevNet project IDs (RevNet Project ID: 119).

**Reactions and view counts** are stored in Vercel KV and accessed through the `/api/` route handlers. Reactions are gated: users need ≥100 MARKEE tokens (ERC20 balance checked on-chain).

### Provider Stack

`app/layout.tsx` wraps the app in `Web3Provider` (`components/providers/`), which nests:
`ApolloProvider` → `WagmiProvider` → `QueryClientProvider` → `RainbowKitProvider` → `ModerationProvider`

Wagmi config is in `lib/config/wagmi.ts`. RainbowKit handles wallet connection UI.

### State Management

- **Server/blockchain data**: Apollo Client + TanStack Query v5
- **Wallet/chain state**: wagmi v2 + viem v2
- **Reactions/views**: Custom hooks (`hooks/useReactions.ts`, `hooks/useViews.ts`) that call the internal API routes
- **Moderation**: `ModerationProvider` in `components/moderation/`

## Contract Addresses (Base)

| Contract | Address |
|---|---|
| LeaderboardFactory (v1.0) | `0x9df259De9dF51143e27d062f3B84Ed8D9AaCc3aA` |
| LeaderboardFactory (v1.0, Superfluid) | `0x45ce642d1dc0638887e3312c95a66fa8fcbae09d` |
| LeaderboardFactory (v1.1, Superfluid) | `0x1e1b0c22e2c6c7b46abb0f25231c7eecd4f0a2d8` |
| LeaderboardFactory (v1.2, Open Internet) | `0x231C5d1374f1Ce0Cc0B9bc3Eda7E03785dD47fe5` |
| LeaderboardFactory (v1.2, GitHub) | `0x0A880A8C102D16325eaa6b426AD3acd48338B501` |
| LeaderboardFactory (v1.2, Superfluid) | `0x72AB2bf7A691Dc331bC0736050A02E7F3a82d352` |
| LeaderboardFactory (v1.3, Open Internet) | `0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c` |
| LeaderboardFactory (v1.3, GitHub) | `0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2` |
| LeaderboardFactory (v1.3, Superfluid) | `0xC497187AAa35C26b0008B43C10A6F6300b7eBcad` |
| Legacy TopDawg | `0x7a6ce4d457ac1a31513bdeff924ff942150d293e` |

Contract addresses and ABIs are in `lib/contracts/addresses.ts` and `lib/contracts/abis.ts`.

## KV Key Patterns (Vercel KV / Redis)

| Key | Description | TTL |
|---|---|---|
| `github:user:{uid}` | GitHub OAuth token + user info | 1 year |
| `github:oauth:state:{state}` | CSRF state | 10 min |
| `github:markee:{address}` | Linked files array per leaderboard | 5 years |
| `github:contract:{address}` | Reverse lookup address → `{owner, repo, githubUserId}` | 5 years |
| `views:github:{address}` | Cached traffic data | 1 hour |
| `cache:superfluid:leaderboards` | Cached Superfluid leaderboard API response | 60 s |
| `cache:github:leaderboards` | Cached GitHub leaderboard API response | 60 s |
| `creator:sf:{address}` | Creator (msg.sender) of a Superfluid leaderboard, for display only and never for authorization | permanent |

## Integrations

- **Superfluid**: S5 rewards, cron job at `/api/cron/superfluid-points` runs hourly via Vercel cron
- **GitHub**: OAuth flow, file linking with address-specific delimiters (`<!-- MARKEE:START:0x... -->`), auto-writes top message to verified markdown files on purchase
- **The Graph**: Two environments — Studio (dev) and decentralized network (prod). Production uses decentralized network.

## Pages

- `/account` — "My Markees": shows all leaderboards the connected wallet currently administers across Superfluid and GitHub. Uses shared listing snapshots on normal loads; explicit post-mutation refreshes use `?bust=1`. Requires `mounted` state guard to prevent ConnectButton flash before wagmi rehydrates.

## Patterns

### Board ownership
The board's live on-chain `admin()` is its only owner. Creator Hub lists boards by `admin`, the Manage drawer re-reads `admin()` before showing controls, and moderation, unlink, metadata and featured-site checks go through `readBoardOwners` in `lib/moderation/server.ts`, which returns only the admin. Never authorize anything by the cached creator. Routes that change a board (attaching a site or repo, unlinking, moderation) require a fresh signature from the current admin, checked by `boardAdminDenial` in `lib/boards/admin-auth.ts` (5-minute window, contract admins such as multisigs accepted).

### Cache bust
Both leaderboard APIs (`/api/superfluid/leaderboards`, `/api/github/leaderboards`) support `?bust=1` to skip the 60-second KV cache and force a fresh RPC fetch. Use this after leaderboard creation or a successful mutation. Normal `/account` hydration and regular listing page loads must use cached responses. Distributed refresh leases coalesce simultaneous refresh requests.

### Wallet hydration flash
Client components that show different UI based on `isConnected` must use a `mounted` state to prevent a flash of the disconnected state on load:
```ts
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])
// Gate wallet-dependent UI on `mounted && isConnected`
```

## Key Conventions

- Path alias `@/*` resolves to the repo root
- Tailwind uses a custom space-themed palette (`midnight-navy`, `deep-space`, `cosmic-indigo`, etc.) defined in `tailwind.config.ts`
- Fonts: Manrope (body) and JetBrains Mono (monospace), loaded via Next.js font system
- Skeleton loaders are used during all async data fetches
- `webpack` fallbacks in `next.config.js` disable `fs`, `net`, `tls` for browser compatibility with Web3 libs
