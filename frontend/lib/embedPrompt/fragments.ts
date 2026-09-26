// Composable fragments for the Website embed AI-prompt wizard (EmbedModal -> WebsiteEmbedWizard).
//
// Each fragment is a small, independently-editable string builder instead of one giant static
// prompt. That's the actual fix for prompt content going stale silently: when MarkeeSignModal's or
// StreamSignModal's UX changes, only the matching buy-flow fragment needs updating, not a 500-line
// block buried in a modal component. Keep it that way -- do not collapse these back into one
// template literal.

import {
  MARKEE_TOKEN_PHASES, LEADERBOARD_REVNET_SHARE, REVNET_BUYER_ETH_SHARE, REVNET_BUYER_TOKEN_SHARE,
} from '../tokenPhases'

export type EmbedFramework = 'nextjs' | 'react' | 'vue' | 'html' | 'other'
export type EmbedWallet = 'privy' | 'rainbowkit' | 'other' | 'none'
export type EmbedAgent = 'claude-code' | 'cursor' | 'codex' | 'copilot' | 'other'
export type EmbedStrategy = 'fixed' | 'streaming'

export interface BuildEmbedPromptInput {
  address: string
  name?: string
  strategy: EmbedStrategy
  framework: EmbedFramework
  wallet: EmbedWallet
  agent: EmbedAgent
}

// ── Reference UI copy ─────────────────────────────────────────────────────────
// Every label the prompt tells an integrator to reproduce verbatim, grouped by the markee.xyz file it
// comes from. The buy-flow fragments interpolate these rather than hardcoding strings, and
// tests/embedPrompt.test.ts fails if any of them stops appearing in its source file -- so renaming a
// button in a modal breaks CI here instead of leaving the prompt describing a UI that no longer exists.
export const UI_COPY = {
  fixedModal: {
    file: 'components/modals/MarkeeSignModal.tsx',
    title: 'CHANGE THE MARKEE SIGN',
    activateTitle: 'ACTIVATE MARKEE',
    addFundsTitle: 'ADD FUNDS',
    editTitle: 'EDIT MESSAGE',
    existingDivider: 'Add funds to an existing message',
    newDivider: 'Or set a new message',
    messageLabel: 'Set your message',
    nameLabel: 'Your Name (optional)',
    namePlaceholder: 'tell the world who wrote this...',
    fund: '+ Fund',
    edit: 'Edit',
    review: 'Review Payment Info',
    split: '62/38 split',
    earned: 'MARKEE earned',
    currentMessage: 'Current message',
    newMessage: 'Set new message',
    ownerOnly: 'As the message owner, only you can change this.',
    freeUpdate: 'Free — message update only',
    connect: 'Connect your wallet to continue.',
  },
  streamingModal: {
    file: 'components/modals/StreamSignModal.tsx',
    title: 'CHANGE THE MARKEE SIGN',
    fundTitle: 'FUND MESSAGE',
    manageTitle: 'MANAGE YOUR STREAM',
    unit: 'ETHx/mo',
    depositManagerLink: 'Deposit Manager →',
    buy: 'Buy Message',
    buyWithDeposit: 'ETH and Buy',
    earned: 'MARKEE earned/mo',
    manage: 'Manage',
    fund: '+ Fund',
    messageFunding: "Message you're funding",
    newRate: 'New monthly rate',
    totalStreamed: 'Total streamed',
    ethxBalance: 'ETHx balance',
    runsOut: 'Runs out in',
    cancelStream: 'Cancel Stream',
    cancelBid: 'Cancel Bid',
    neverWon: 'Your payment stream will start if this message starts winning.',
    depositStays: 'Your deposit stays as ETHx, usable for any other message.',
    stepCreate: 'Create Markee Message',
    stepApprove: 'Approve Deposit',
    stepStart: 'Start Stream',
    stepMove: 'Move Stream',
    stepUpdate: 'Update Stream',
  },
  review: {
    file: 'components/modals/StreamUI.tsx',
    paying: 'Paying',
    depositing: 'Depositing now',
    runway: 'Payment balance time remaining',
    earn: "You'll earn",
    fixedWin: 'Your message will be featured immediately',
    fixedLose: 'Not featured yet',
    rentWin: 'Your payment only streams while your message is winning',
    rentLose: "You are placing a bid for a message that won't be featured yet",
    rentWinNote: "Anyone can overtake your message by bidding more, pausing your payment until you're winning again. You can cancel at any time.",
    rentLoseNote: "You won't pay for time your message isn't winning, although you'll see an outgoing stream that's being refunded 100% to your wallet.",
    confirm: 'Confirm Payment',
  },
  depositManager: {
    file: 'components/modals/DepositManagerModal.tsx',
    title: 'Deposit Manager',
    runsOut: 'Runs out in',
    runsOutTip: 'If you run out of ETHx, your bids will be cancelled.',
    balance: 'ETHx balance',
    balanceTip: 'Markee uses Superfluid for payment streaming. Deposit ETH to get ETHx you can use for payments.',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    streamingNow: 'Streaming now',
    notStreaming: 'Bids not streaming',
    yourStreams: 'Your streams',
  },
  createStreamFlow: {
    file: 'hooks/useCreateStreamFlow.ts',
    alreadyStreaming: 'You already have an active stream to this board.',
  },
  fixedPill: { file: 'app/markee/[address]/page.tsx', suffix: 'to change' },
  streamingPill: { file: 'components/StreamingBoardDetail.tsx', suffix: 'to rent' },
} as const

const AGENT_LABEL: Record<EmbedAgent, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  copilot: 'GitHub Copilot',
  other: 'your coding agent',
}

const FRAMEWORK_LABEL: Record<EmbedFramework, string> = {
  nextjs: 'Next.js',
  react: 'React (Vite / CRA)',
  vue: 'Vue',
  html: 'plain HTML / vanilla JS',
  other: 'your stack',
}

// ── Core identity ─────────────────────────────────────────────────────────────
export function coreIdentityFragment(
  { address, name, buyUrl, strategy }: { address: string; name?: string; buyUrl: string; strategy: EmbedStrategy },
): string {
  const displayName = name || address
  const rankingLine = strategy === 'streaming'
    ? 'Markee is a protocol where anyone can pay ETH to set the featured message on a leaderboard. On this leaderboard, backers pay by streaming a continuous ETH/month rate (Superfluid) instead of a lump sum -- the highest current *rate* holds the top spot, not the highest cumulative total, and anyone can overtake it by streaming faster.'
    : 'Markee is a protocol where anyone can pay ETH to set the featured message on a leaderboard. The highest total funder holds the top spot; anyone can outbid them to take it.'
  const sourceRefLine = strategy === 'streaming'
    ? `the streaming contract at \`contracts/v1.3/streaming/StreamingLeaderboard.sol\`, the reference modals at \`frontend/${UI_COPY.streamingModal.file}\` and \`frontend/${UI_COPY.depositManager.file}\` (the UX to replicate), and the write flows under \`frontend/lib/superfluid/streaming.ts\` and \`frontend/hooks/useCreateStreamFlow.ts\`, \`useOpenStreamFlow.ts\`, \`useUpdateStreamRateFlow.ts\`, \`useMoveStreamFlow.ts\``
    : `the leaderboard contract at \`contracts/v1.3/Leaderboard.sol\` and the reference modal at \`frontend/${UI_COPY.fixedModal.file}\` (the UX to replicate)`
  return `# Markee embed setup

${rankingLine}

My leaderboard:
- Name: ${displayName}
- Address: ${address}
- Fallback buy page (works from anywhere, not required for the embedded flow below): ${buyUrl}

**If you have web access, use it before writing any transaction code:** Markee's contracts and frontend are open source at https://github.com/1Hive/markee. This prompt describes the on-chain interface and UX in enough detail to build correctly without fetching anything -- but the source is the actual ground truth, and cross-checking it against ${sourceRefLine} costs a few minutes against the cost of a wrong transaction shipping to real visitors. If you don't have web access, everything below is accurate as written; proceed without it.

Build a fully embedded flow -- visitors buy, edit, and add funds to messages without ever leaving this site. Do not fall back to an iframe.

**Before you conclude something is wrong, read this:** https://markee.xyz/api/ecosystem/leaderboards is
the PUBLIC marketplace listing, and it deliberately only includes leaderboards that have completed
Markee's own "Verify Embed" check -- it's a spam filter for the public listing, not a directory of
every leaderboard that exists. A brand-new integration's address will not appear there yet, and that
is expected, not a sign the address is wrong or stale. Build against the address above regardless --
don't treat its absence from that endpoint as a reason to stop or ask before writing any code. Verification
itself only checks that \`data-markee-address\` is present in your server-rendered HTML (see the
implementation notes at the end of this prompt); it does not depend on this fetch succeeding. Once
verified, the same code you're about to write starts resolving real data automatically -- nothing
needs to change or redeploy.`
}

// ── Trigger card & brand watermark ─────────────────────────────────────────────
// The piece integrators most often skip or reinvent -- without it you get a generic "Buy" button
// instead of something that reads as Markee. Mirrors markee.xyz's own hero card
// (components/board-detail/shared.tsx's FeaturedCard + MarkeeWatermark), restyled in the host
// site's own colors -- not Markee's pink, just Markee's shape.
export function triggerCardFragment(): string {
  return `## Trigger card: match Markee's own hero-card pattern

The card that displays the current top message should feel like a real piece of this site's UI, not
an embedded widget -- but its shape should be unmistakably Markee:

- Bold, large message text as the card's headline (monospace or a heavy sans font, ~24-34px; a
  subtle gradient text-fill from your primary text color into your accent color if your design
  system supports gradient text). A small eye-icon view count in the top-right corner. The message
  owner's name (or truncated 0x1234...abcd address) bottom-right, prefixed with "-".
- On hover: a pill badge slides up from the bottom-center edge showing the price/action, or
  "be first!" if there's no message yet. Fade in with a slight upward translate, not an instant
  show/hide. Use exactly markee.xyz's wording and number formatting:
  - **For Sale:** "<price> ${UI_COPY.fixedPill.suffix}", where price is what it costs to take #1 --
    the top message's \`totalFundsAdded\` + 0.001 ETH. Show it in USD ("$4.12 ${UI_COPY.fixedPill.suffix}") if you
    have an ETH price, otherwise ETH to 3 decimals ("0.006 ETH ${UI_COPY.fixedPill.suffix}").
  - **For Rent:** "<rate> ${UI_COPY.streamingPill.suffix}", where rate is \`effectiveRate(topMarkee())\` (wei/sec)
    converted to ETH/month (× 2,628,000) and formatted to at most 4 decimals with trailing zeros
    stripped: "0.0009 ETH/mo ${UI_COPY.streamingPill.suffix}". A nonzero rate under 0.00005 ETH/mo reads
    "< 0.0001 ETH/mo" -- never let rounding show a live, paid rate as "0 ETH/mo". Read this rate
    on-chain, not from the listing API (which omits unverified boards, see "Sourcing the trigger
    card's message" below).
- **No heading, label, or eyebrow text above the card** (no "MARKEE", "Sponsored", "Featured
  message" or similar). The card stands on its own in the page's layout; the watermark below is the
  branding.
- **Brand watermark (required on every integration, not optional styling):** the real Markee logo,
  translucent, centered in the trigger card behind the message text -- not recreated
  letterforms (an earlier version of this spec tried approximating "MAR"/"KEE" as plain text in a
  guessed font and the two words visibly mismatched in weight) and not blend-mode or CSS-mask tricks
  to hide the logo's own background (earlier versions of this spec tried that too, chasing a
  corner-bled placement that collided with message text and, for the masked version, ran into
  inconsistent real-world support for the CSS \`mask-mode\` property that made it render as nothing
  at all). Use the light or dark logo mark -- **not the purple one** -- picking whichever actually
  reads against the card's own background, the same background you already identified while matching
  this site's theme (see below): a light card background -> \`https://www.markee.xyz/markee-logo-dark.png\`
  (near-black mark), a dark card background -> \`https://www.markee.xyz/markee-logo-light.png\` (near-white
  mark). If this card's background switches with the site's own light/dark mode, swap the watermark's
  \`src\` alongside whatever mechanism you already used to make the rest of the modal theme-aware (a
  \`data-theme\` attribute, a dark-mode class, a \`prefers-color-scheme\` media query) rather than
  picking one variant and leaving it fixed:
  \`\`\`
  <div style="position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none; z-index:-1; display:flex; align-items:center; justify-content:center">
    <img src="https://www.markee.xyz/markee-logo-dark.png" alt="" aria-hidden="true" style="
      height:100%; width:auto;
      opacity:{hover ? 0.16 : 0}; transition:opacity 220ms;
    " />
  </div>
  \`\`\`
  (swap the \`src\` to \`markee-logo-light.png\` for a dark card background, per the rule above)

  Sized to the card's own height (\`height:100%\` against the wrapper's \`inset:0\`, which makes the
  wrapper exactly the card's own size) rather than a fixed pixel range -- this way it's correctly
  proportioned whether the trigger card is short or tall, with no per-integration size tuning needed.
  Width follows automatically from the logo's own square aspect ratio; \`overflow:hidden\` on the
  wrapper clips it on unusually narrow cards instead of letting it spill past the edge. Centered, not
  corner-anchored -- this is what actually keeps it clear of the message headline without needing
  pixel-precise collision math against text that wraps to a variable number of lines: a translucent
  mark diffused across the middle of the card reads as a soft background texture regardless of
  exactly where the message text falls. It shares the hover pill's trigger --
  fades in and out together with the pill, rather than sitting there permanently. The wrapper's own
  \`overflow:hidden\` does the clipping -- don't set it on the whole card, or the price pill (which
  intentionally bleeds past the card's bottom edge) gets cut off too. Give the card container an
  explicit \`z-index\` (not just \`position: relative\`) so the watermark's negative z-index stays
  contained instead of escaping behind your page's own background -- position + z-index together is
  what actually creates a new stacking context; position alone doesn't.
- Card container: rounded corners (12-16px), a subtle 1px border that brightens on hover, slight lift
  (translateY(-2px)) + shadow-on-hover, backdrop blur if your design system already uses
  glassmorphism.

This card is also the click target that opens the buy modal below.`
}

// ── Wallet setup ──────────────────────────────────────────────────────────────
// wagmi + viem is the one non-negotiable base under every option -- every contract-call fragment
// below assumes it. Don't pre-detect whether it's already installed; let the agent figure that out
// from the target repo.
export function walletFragment(wallet: EmbedWallet): string {
  if (wallet === 'none') {
    return `## Wallet connection: none set up yet

This site doesn't have a wallet library installed. Use plain \`wagmi\` with its built-in connectors --
**no third-party account, dashboard signup, API key, or domain allowlist needed**, so this works the
moment it deploys. Don't reach for Privy, Dynamic, RainbowKit, or any other hosted wallet service
here; each one needs the site owner to register an app and configure keys before anything works.

Requires: \`wagmi\`, \`viem\`, \`@tanstack/react-query\` (plus \`@coinbase/wallet-sdk\`, which wagmi's
Coinbase connector loads -- install it if your package manager doesn't pull it in automatically).

\`\`\`ts
import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, coinbaseWallet } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected(),                                   // MetaMask, Rabby, Brave, any browser-extension wallet
    coinbaseWallet({ appName: '<this site name>' }), // Coinbase Wallet app/extension, or a new Smart Wallet
  ],
  transports: { [base.id]: http() },
  ssr: true, // Next.js / any SSR framework
})
\`\`\`
Provider order: \`WagmiProvider\` -> \`QueryClientProvider\`.

Why these two: \`injected()\` covers visitors who already have a browser wallet. \`coinbaseWallet()\`
covers everyone else -- a visitor with no wallet at all can create a Coinbase Smart Wallet in a popup
with a passkey (no extension, no seed phrase, no app install), it lives natively on Base, and it has
its own "add funds" flow (card, Apple Pay, or a Coinbase account) built into the wallet popup.
That's what makes this a real replacement for an embedded-wallet service rather than a
crypto-natives-only setup. Keep the connector's default preference (which offers both Smart Wallet
creation and the existing Coinbase Wallet app/extension) unless you have a reason to narrow it.

Connect UI: build a small chooser from \`useConnect()\`'s \`connectors\` -- one button per connector,
labelled from \`connector.name\` ("Browser Wallet" is a clearer label than "Injected" for the
\`injected()\` entry; hide it when \`window.ethereum\` is undefined, since it can't do anything then),
calling \`connect({ connector })\`. Show it in place of the buy modal's body when no wallet is
connected (see the modal spec below), matching markee.xyz's "${UI_COPY.fixedModal.connect}" state, with the
connected address + a disconnect action once connected. If \`useAccount().chainId\` isn't 8453, show a
"Switch to Base" button calling \`switchChain({ chainId: 8453 })\`.

Optional, only if the site owner wants it: \`walletConnect({ projectId })\` adds QR-code connection
for mobile wallets, but needs a free project ID from https://cloud.reown.com -- leave it out by
default so the embed works with zero configuration.

Low balance: there's no card-funding hook to call from the page itself. When the connected wallet
can't cover a payment, show an inline notice (not just a disabled button) with the wallet address
and a copy button, telling the visitor to add ETH on Base -- and, if they connected with Coinbase
Smart Wallet, that they can add funds from inside the wallet popup.`
  }
  if (wallet === 'other') {
    return `## Wallet connection: existing setup

This site already has a wallet connection library in place -- ConnectKit, Web3Modal/AppKit, Dynamic,
thirdweb, a custom \`wagmi\` connector setup, or similar. Don't replace it or introduce a second
one. Reuse whatever's already wired up for connect/disconnect; this embed only needs \`wagmi\`'s
\`useAccount()\` and \`useWriteContract()\` against the existing config, plus a way to trigger the
site's existing connect flow when a visitor without a wallet clicks the trigger card (close your own
modal first if the existing connect UI would otherwise stack behind it, matching the RainbowKit
z-index note elsewhere in this prompt). Confirm Base (chainId 8453) is already in the existing
config's supported chains -- add it if not.`
  }
  if (wallet === 'privy') {
    return `## Wallet connection: Privy

If this repo already has Privy wired up, extend that setup -- add Base to its supported chains if missing, reuse its existing provider stack and env var name, don't stand up a second \`PrivyProvider\`/wagmi config or a differently-named app-id variable next to the existing one. The rest of this section assumes you're setting Privy up fresh.

Requires: \`@privy-io/react-auth\`, \`@privy-io/wagmi\`, \`wagmi\`, \`viem\`.

Provider order matters:
\`PrivyProvider\` (appearance, embedded-wallet config) -> \`WagmiProvider\` (config built via \`@privy-io/wagmi\`'s wagmi adapter, not \`getDefaultConfig\`) -> \`QueryClientProvider\`.

Connect button pattern:
\`\`\`ts
const { authenticated, login, logout } = usePrivy()
const { address } = useAccount() // from wagmi, populated once Privy authenticates
// authenticated === false -> render a "Connect" button that calls login()
// authenticated === true  -> render the address + a logout() button
\`\`\`

Chain: Base (chainId 8453). Set \`NEXT_PUBLIC_PRIVY_APP_ID\` (or your framework's env-var equivalent) from your Privy dashboard.

If a visitor doesn't have enough ETH, Privy's \`useFundWallet\` (also from \`@privy-io/react-auth\`) opens a card-funding flow: \`fundWallet({ address, options: { chain: base, amount } })\`. Use this for the low-balance banner instead of just showing an error.`
  }
  return `## Wallet connection: RainbowKit

If this repo already has RainbowKit wired up -- likely, since you're reading this because it was detected or selected -- extend that existing config instead of the steps below: add Base to its \`chains\` if missing, reuse whatever env var it already reads for the WalletConnect project ID, and reuse its existing provider stack. Standing up a second \`getDefaultConfig\`/\`WagmiProvider\` alongside the real one, or introducing a second env var under a different name for the same project ID, is the single most common way this section goes wrong. Only follow the steps below if there's genuinely no existing RainbowKit setup in this repo.

Requires: \`@rainbow-me/rainbowkit\`, \`wagmi\`, \`viem\`, \`@tanstack/react-query\`.

Provider order matters:
\`WagmiProvider\` -> \`QueryClientProvider\` -> \`RainbowKitProvider\`.

wagmi config: \`getDefaultConfig({ appName, projectId, chains: [base], ssr: true })\`. Set \`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID\` (get a free ID at https://cloud.reown.com, formerly WalletConnect Cloud).

Connect button: RainbowKit's own \`<ConnectButton />\`, or \`useConnectModal()\` if you need to open it programmatically. If you're triggering it from inside your own buy modal, close your modal first (\`useConnectModal()\`'s dialog otherwise ends up stacked behind it) and reopen yours once the connect modal closes.

Chain: Base (chainId 8453).`
}

// ── Strategy-specific contract interaction ─────────────────────────────────────
// Fixed: TopDawgPartnerStrategy-family contract (deployed via LeaderboardFactory) -- the same
// contract MarkeeSignModal talks to. The UI spec for it lives in fixedBuyFlowFragment below.
function fixedStrategyFragment(address: string): string {
  return `## Contract interaction: For Sale (competitive bidding)

This leaderboard uses a fixed-price competitive strategy: the highest cumulative bid holds the top spot. Anyone can take it by paying more.

Leaderboard contract: ${address} (Base, chainId 8453)

ABI functions needed:
- \`minimumPrice() view -> uint256\` -- floor price in wei for a brand-new message
- \`maxMessageLength() view -> uint256\`
- \`maxNameLength() view -> uint256\`
- \`getTopMarkees(limit: uint256) view -> (address[], uint256[])\` -- top markee addresses + their cumulative funds, ordered descending
- \`createMarkee(message: string, name: string) payable -> address\` -- creates a new message and pays into it
- \`addFunds(markeeAddress: address) payable\` -- adds funds to an existing message (yours or someone else's, to help it win)
- \`updateMessage(markeeAddress: address, message: string)\` -- rewrites the text of a message you already own (no payment)

Per-markee ABI (call on each address returned by \`getTopMarkees\`):
- \`message() view -> string\`
- \`name() view -> string\`
- \`owner() view -> address\`
- \`totalFundsAdded() view -> uint256\`

To outbid the current #1: \`topFundsAdded + 1000000000000000n\` wei (0.001 ETH minimum increment). If there's no top message yet, use \`minimumPrice()\`.`
}

// Streaming: Superfluid CFA/GDA under a custom StreamingLeaderboard contract. This is materially
// more involved than the fixed flow and genuinely Markee-specific (buffer deposits, markee-tagged
// flows, a mandatory GDA pool connect) -- a generic "use the Superfluid SDK" pointer is not enough,
// because the SDK's plain createFlow doesn't know about our buffer/pool/tagging requirements. Give
// the real operation sequence, mirroring lib/superfluid/streaming.ts.
function streamingStrategyFragment(address: string): string {
  return `## Contract interaction: For Rent (streaming)

This leaderboard uses a streaming strategy built on Superfluid: backers pay a continuous ETHx flow rate (ETH/month) instead of a lump sum. The top spot is held by whoever's *current rate* is highest -- promotion is automatic (it flips inside the contract's own inflow callback the instant a challenger's rate clears the incumbent's), but **demotion is not**: if the top backer's rate drops, the contract only heals the ranking when someone calls the permissionless \`claimTop(challengerMarkee)\` on the new-rightful #1. This is not a safe no-op to call speculatively after every rate change -- it reverts \`AlreadyTop\` if you pass the current top, or \`NotHigherThanTop\` if you pass anything that hasn't actually overtaken it, which is true most of the time nothing needs healing. Only call it when \`getTopMarkees(1)[0]\` (the live, recomputed ranking) disagrees with \`topMarkee()\` (the contract's enforced #1) -- and when it does, pass \`getTopMarkees(1)[0]\` as the challenger.

This is more involved than a normal payable call, and it does not compose the way a generic Superfluid SDK snippet assumes. Don't reach for \`sf.cfaV1.createFlow\` or similar -- our contract wraps CFA/GDA with buffer deposits and per-message pools, tags every flow with the target message via \`userData\`, and behaves differently on create vs. update in a way that will silently misroute a payment if you guess. Use the exact sequences below.

Leaderboard contract: ${address} (Base, chainId 8453)
Superfluid contracts (Base): host \`0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74\`, ETHx (super token) \`0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93\`, CFAv1Forwarder \`0xcfA132E353cB4E398080B9700609bb008eceB125\`

Reads:
- \`minimumMonthlyRate() view -> uint256\` (wei/month floor)
- \`backerMarkee(address) view -> address\` -- which message an address currently backs, if any. **A backer can only ever stream to one message on a given board at a time** -- Superfluid's CFA allows exactly one flow per (sender, receiver) pair, and the receiver here is always the board contract itself, not the individual message. Before opening a new stream, check this (or the CFAv1Forwarder read below) and branch into "update rate" or "switch message" instead, per the flows below.
- \`backerDeposit(address) view -> uint256\`
- \`poolOf(markeeAddress) view -> address\` -- the GDA refund pool for a given message (needed below)
- \`topMarkee() view -> address\` -- the contract's own enforced #1 (see below for why this, not \`getTopMarkees\`, is also what should drive your trigger card's display).
- \`effectiveRate(markee) view -> uint256\` -- the real bar a challenger must clear to take #1 from \`markee\`: \`max(live aggregate rate, a decaying legacy floor)\` for boards migrated from a lump-sum leaderboard, or just the live rate on a natively-created one. **Use \`effectiveRate(topMarkee())\` for your WIN preset**, not \`topRate()\` (see next bullet) -- they only agree on boards with no legacy floor.
- \`topRate() view -> uint256\` -- the contract's last-recorded stream amount for the current #1, used internally for the beneficiary's payout share. It is *not* always the same as the actual promotion threshold: a migrated board can hold #1 on a legacy floor while its live \`aggregateRate\` (what \`topRate\` reflects) is lower or zero, so \`topRate()\` can understate what a challenger actually needs to overtake it. Don't use it for WIN.
- CFAv1Forwarder's \`getFlowrate(token, sender, receiver) view -> int96\` -- cheaper read than going through the host; also how you detect an existing stream to gate the create-vs-update-vs-switch branch above.

Resolve the CFA and GDA agreement class addresses dynamically via \`host.getAgreementClass(agreementId)\` rather than hardcoding them -- Superfluid can redeploy agreement classes.

### Sourcing the trigger card's message

Don't source the trigger card's displayed message solely from the listing API below (the proxy route in "Data fetching") -- that response omits this board entirely until it passes Markee's verification check (see the core note near the top of this prompt), so a brand-new integration would show the empty "be first!" state even while its top message is live and paid for. Instead, read \`topMarkee()\` directly (already in your reads above) and, when it's not the zero address, call \`message()\`/\`name()\`/\`owner()\` on that address the same way you would for any other markee -- this is on-chain and correct regardless of verification status. Show "be first!" only when \`topMarkee()\` itself is the zero address, not when the listing API has no entry for this board yet. (\`getTopMarkees\` also works for this, but recomputes live ranking off every registered markee and can briefly disagree with the enforced \`topMarkee()\` before a pending \`claimTop\` heals it -- prefer \`topMarkee()\` for what the trigger card shows.)

### Creating a message before backing it

Backing only works on a message that already exists on this board. If the visitor is backing a brand-new message (not adding to or switching between existing ones), create it first, as its own transaction, before any of the streaming batches below:
\`\`\`
board.createMarkee(message, name) -> markeeAddress   // no payment -- creates the message, unfunded
\`\`\`
This emits \`MarkeeCreated(markeeAddress, owner, message, name)\`; decode the new address from the receipt logs (or read \`markeeCount()\` then call \`markees(markeeCount() - 1)\`). Skipping this and streaming straight to an address that was never created reverts with \`UnknownMarkee\` -- the board's inbound-flow callback checks \`isMarkeeOnLeaderboard[markee]\` before accepting anything.

**If the visitor already backs a different message on this board**, creating a new one doesn't give you a fourth option -- \`createMarkee\` itself is fine (any wallet can call it, whether or not it's currently streaming), but a backer can only ever have one open flow to this board (see the CFA one-flow-per-pair note below), so a plain "open a fresh stream to the new message" batch reverts while their old stream is still live. Match markee.xyz (\`useCreateStreamFlow\`): check \`getFlowrate(ethx, visitor, board)\` before sending anything, and if it's nonzero, block with "${UI_COPY.createStreamFlow.alreadyStreaming} Stop it first, then activate your new Markee." -- pointing them at "${UI_COPY.streamingModal.manage}" on the row they back, where the cancel action lives (see the Manage view in the buy-flow spec below). Once stopped, the new message is created and backed as a fresh first stream.

The pool for the new message is created in the same \`createMarkee\` transaction, but RPC nodes can lag a block or two behind -- poll \`poolOf(markeeAddress)\` until it's non-zero before including it in the batch below, rather than reading it once and assuming it's ready.

So the full "back a brand-new message" sequence is three separate transactions: **createMarkee → approve → batchCall (below)**, not one.

### Opening a stream (first stream to this board)

Batched via \`host.batchCall(operations[])\`, in this exact order:
1. **Wrap** (only if needed) -- \`ETHx.upgradeByETHTo(backer)\`, payable with the ETH you're sending in. Must run first when present so the host's ETH balance is drained before the later value-0 forwards. **Omit this op entirely** if the backer's existing ETHx balance already covers what's needed below -- \`upgradeByETH\` reverts on a zero amount, it isn't safe to always include with value 0.
2. **Deposit buffer** -- \`board.depositBuffer(backer, bufferAmount)\`, forwarded to the backer, where \`bufferAmount = ratePerSec * 14400\`. That constant is Base Superfluid's liquidation period in seconds -- **4 hours of the stream's own per-second rate, not "4x the monthly rate"** (those numbers differ by a factor of ~730). Read it from the board's \`BUFFER_PERIOD\` rather than hardcoding, in case it's ever reconfigured.
3. **Create the flow** -- \`cfa.createFlow(ethx, board, ratePerSec, ctx)\`, called as an agreement operation with the target *markee* address ABI-encoded into \`userData\` so the board's callback can associate the flow with the right message. This only works for a backer's **first** stream to this board -- see "Updating your rate" and "Switching which message you back" below for an existing backer.
4. **Connect the pool** -- \`gda.connectPool(poolOf(markee), ctx)\`, called as an agreement operation. **This is not optional**: an unconnected backer's wallet drains at the full stream rate while their refund accrues unclaimed in the pool, which can get them liquidated even though they're technically being refunded.

How much to wrap -- the **auto-deposit**, using markee.xyz's exact rule (\`computeAutoDeposit\` in \`frontend/lib/superfluid/streaming.ts\`) so the amounts match the reference UI:
- \`buffer = ratePerSec * BUFFER_PERIOD\`. If the backer's ETHx balance is already more than \`2 * buffer\`, wrap nothing (omit the wrap op).
- Otherwise wrap \`min(3 * monthlyRate, affordable)\`, where \`affordable\` = wallet ETH minus 0.001 ETH (kept back for gas) if the wallet holds at least 0.002 ETH, else 90% of the wallet's ETH.
- \`prefund = ETHx balance + wrap - buffer\`; the runway shown in the UI is \`prefund / ratePerSec\` seconds. If \`prefund\` isn't greater than \`buffer\`, don't submit -- show "Fund the stream for longer (a few hours minimum)."

Important: the ERC20 \`approve\` that authorizes step 2's pull must be sent as its **own transaction beforehand**, not batched in -- operations forwarded through the batch run with the forwarder contract as \`msg.sender\`, so an in-batch approve would authorize the wrong account.

### Updating your rate (same message you already back)

If \`backerMarkee(you)\` already equals the message you're funding, changing the amount is a **rate update on the same flow**, not a new one: \`cfa.updateFlow(ethx, board, newRatePerSec, ctx)\`, no \`userData\` needed (the board looks up your message from \`backerMarkee[sender]\`, not from the call). The pool is already connected from your original stream. If the new rate needs more buffer than your current deposit covers, add a \`depositBuffer\` top-up (and a wrap, if needed) to the same batch, before the \`updateFlow\` op.

### Switching which message you back

To move an existing stream to a **different** message on the same board, do **not** call \`updateFlow\` with a different address in \`userData\` -- the board's update callback ignores \`userData\` entirely and keeps charging whatever message \`backerMarkee[sender]\` already points to, so the payment keeps flowing to the old message while the UI shows the new one. Instead, batch:
1. \`cfa.deleteFlow(ethx, backer, board, ctx)\` -- closes the old flow (frees \`backerMarkee\`, zeroes your units on the old message's pool)
2. \`cfa.createFlow(ethx, board, ratePerSec, ctx)\` -- with the new message's address in \`userData\`, exactly like opening a fresh stream
3. \`gda.connectPool(poolOf(newMarkee), ctx)\` -- your existing pool connection was to the old message's pool; the new one needs its own

Your existing \`backerDeposit\` survives the delete (deposits are tracked per-backer, not per-message), so only include a \`depositBuffer\` top-up if the new rate needs more than what's already deposited.

### Deposit / rate math

- Buffer required for a given rate: \`ratePerSec * BUFFER_PERIOD\` (BUFFER_PERIOD = 14400, i.e. 4 hours -- see above).
- Converting a quoted ETH/month figure to \`ratePerSec\`: **floor first** (\`weiPerMonth / 2_628_000\`), and only round up if that floored rate would recover to less than the board's \`minimumMonthlyRate()\` when multiplied back out. Ceiling-only is simpler but overshoots every rate that isn't an exact multiple of 2,628,000 (e.g. a clean 0.001 ETH/mo quote would silently charge 0.001000000000512 ETH/mo) -- boards intentionally set \`minimumMonthlyRate\` a hair under round numbers specifically so the floored value still clears it.
- \`board.minimumPrice()\` is an alias for \`minimumMonthlyRate()\`, kept for ABI compatibility with the fixed-price side -- either name works.

### Stopping a stream and reclaiming funds

- **Stop:** drive the flow rate to \`0\` via the CFAv1Forwarder's \`setFlowrate(ethx, board, 0)\` (equivalent to \`deleteFlow\`). This is the "Cancel Stream" / "Cancel Bid" action in the Manage view below.
- **ETHx -> ETH:** ETHx's own \`downgradeToETH(amount)\` unwraps a backer's ETHx balance back to ETH (the Deposit Manager's "Withdraw"); \`upgradeByETH()\` (payable) wraps ETH into ETHx ("Deposit").
- **Buffer:** \`withdrawDeposit()\` on the board reclaims buffer no longer needed (everything once no stream is open; the surplus above \`rate * BUFFER_PERIOD\` otherwise). markee.xyz doesn't expose this as a button, so it's optional here too.`
}

export function strategyFragment(strategy: EmbedStrategy, address: string): string {
  return strategy === 'streaming' ? streamingStrategyFragment(address) : fixedStrategyFragment(address)
}

// ── Buy modal UX ──────────────────────────────────────────────────────────────
// Mirrors components/modals/MarkeeSignModal.tsx (For Sale), StreamSignModal.tsx (For Rent),
// DepositManagerModal.tsx and StreamUI.tsx's PaymentReviewCard. Labels come from UI_COPY so the drift
// test catches renames; layout/flow changes in those files still need a matching edit here.

// Same formula as lib/tokenPhases.ts's estimateLeaderboardPurchaseMarkeeTokens, with the issuance
// schedule generated from MARKEE_TOKEN_PHASES so it can't drift from what markee.xyz itself shows.
function markeeEstimateNote(): string {
  const factor = LEADERBOARD_REVNET_SHARE * REVNET_BUYER_ETH_SHARE * REVNET_BUYER_TOKEN_SHARE
  const schedule = MARKEE_TOKEN_PHASES
    .map(p => `${p.start.toISOString().slice(0, 10)} → ${p.rate.toLocaleString('en-US')}`)
    .join(', ')
  return `**MARKEE estimate** (the "earned" tile and the review step's "${UI_COPY.review.earn}" row): \`MARKEE = ETH × ${factor.toFixed(6)} × issuanceRate\`, where \`issuanceRate\` is the MARKEE-per-ETH rate of the period containing today, from this schedule (each rate applies from its date until the next one; after the last date, keep the last rate): ${schedule}. Compute it client-side from this table; there's no endpoint for it. For Rent applies the same formula to the monthly rate and labels it per month.`
}

// ASCII wireframe of the main view, padded programmatically so it stays aligned whatever the
// interpolated UI_COPY labels are.
function mainViewMockup(): string {
  const f = UI_COPY.fixedModal
  const s = UI_COPY.streamingModal
  const W = 62
  const rule = `+${'-'.repeat(W)}+`
  const line = (text: string, note = '') => `| ${text.padEnd(W - 2)} |${note ? `  <- ${note}` : ''}`
  const divider = (label: string) => {
    const side = Math.max(3, Math.floor((W - 6 - label.length) / 2))
    return line(` ${'-'.repeat(side)} ${label.toUpperCase()} ${'-'.repeat(side)}`)
  }
  const spread = (left: string, right: string, width = W - 4) => `${left}${right.padStart(width - left.length)}`
  return [
    rule,
    line(spread(`(*) ${f.title}`, '[eye] 67   x', W - 2)),
    rule,
    divider(f.existingDivider),
    line(`  ${spread('(1) streamin n dreamin', `0.004 ETH/mo [${s.fund}]`)}`),
    line(`  ${spread('    [eye] 47', '- 0x2556...F06E            ')}`),
    line(`  ${spread('(2) take me to the top ^', `0.001 ETH/mo [${s.manage}]`)}`, 'the row this wallet backs'),
    line(`  ${spread('    [eye] 1', '- 0x809C...7714  YOU       ')}`),
    divider(f.newDivider),
    line(`  ${spread(f.messageLabel.toUpperCase(), '0/222')}`),
    line(`  ${`[ Your message here... (222 max)`.padEnd(W - 5)}]`, 'accent-colored border'),
    line(`  ${f.nameLabel.toUpperCase()}`),
    line(`  ${`[ ${f.namePlaceholder}`.padEnd(W - 5)}]`),
    rule + '  <- pinned footer, always visible',
    line(`  ${'[ amount card -- per strategy'.padEnd(W - 5)}]`),
    line(`  [ 7.304   MARKEE earned ]   ${'[ primary button'.padEnd(W - 33)}]`),
    line(`  ${spread('', `${f.split} (i)`)}`),
    rule,
  ].join('\n')
}

function buyModalShellFragment(): string {
  const f = UI_COPY.fixedModal
  const r = UI_COPY.review
  return `## The buy modal: replicate markee.xyz's "Change the Markee Sign" modal

This modal is the part integrators most often reinvent, and it's the part that most needs to match. Rebuild markee.xyz's own modal: **the same views, the same sections in the same order, the same button labels and copy, the same flow between views.** Only colors, fonts, radii and spacing come from this site's theme (see "Match this site's theme"). Don't collapse it into a single form, don't add radio-button pickers, and don't write your own copy -- every quoted string below is the real one.

Main view layout (For Rent shown; the row amounts, row buttons and amount card differ per strategy, see below):
\`\`\`
${mainViewMockup()}
\`\`\`
- **Header:** a small pulsing accent-colored dot, the view's title in uppercase monospace (titles per view below), the total view count across all messages with an eye icon (main view only), and an × close button. A divider under it.
- **Existing messages** (hidden entirely, both dividers included, when the board has none): the centered divider label "${f.existingDivider}", then one row per message in ranked order -- a rank circle (filled with the accent color for #1, which also gets a subtle highlighted row background), the message in bold monospace truncated to one line, and under it the meta line: eye icon + view count on the left, "- <name or 0x1234...abcd>" on the right, plus a small "YOU" pill when the connected wallet owns it. Right side: the message's amount, then the row's action button(s). Cap this list at about two rows tall with its own scroll -- it's secondary to composing below. Then the divider "${f.newDivider}".
- **Compose:** "${f.messageLabel}" label with a live \`n/maxMessageLength\` counter, a two-row textarea (placeholder "Your message here... (<max> max)") styled as the emphasized input -- accent-colored border with a faint glow -- then "${f.nameLabel}" with an input (placeholder "${f.namePlaceholder}", capped at \`maxNameLength\`).
- **Pinned footer:** the amount card, then a two-column row -- the MARKEE "earned" tile (accent gradient background, big number on the left, label on the right) and the primary button, equal height -- then "${f.split}" right-aligned with an info tooltip reading "62% to the sign's beneficiary / 38% to Markee's Revnet / Your MARKEE is issued by the Revnet".
- **View counts:** \`GET https://www.markee.xyz/api/views?addresses=<comma-separated markee addresses>\` returns \`{ "<address>": { "totalViews": n } }\`. It's CORS-open; call it straight from the browser.

Every other view (Add Funds, Edit, Fund, Manage) replaces the body with that view's content, a "← Back" link at the top, and a **footer bar**: a note on the left, the primary button on the right.

Shared states and behavior:
- **Not connected:** replace the body with "${f.connect}" and your connect chooser (see the wallet section). **Wrong network:** "Switch to Base to use Markee." with a "Switch to Base" button.
- **Review step before every payment:** the primary button always reads "${f.review}". Clicking it swaps the view's content for a review card and the footer for "Back" / "${r.confirm}" ("Confirming…" while busy); the wallet prompt only opens on "${r.confirm}". The review card: the message in a bordered box, then rows "${r.paying}" (amount, plus "(≈ $X)" if you have an ETH price) -> "${r.depositing}" (For Rent, when this transaction wraps ETH) or "${r.runway}" (For Rent, when it doesn't) -> "${r.earn}" (MARKEE estimate) -> an outcome banner (copy per strategy below).
- **Transaction progress:** while signing/confirming, replace the body with a progress panel -- "Waiting for wallet…" while the wallet prompt is open, then "Confirming on Base" with "Usually under 2 seconds on Base.", then a success headline (per strategy) with "The sign will refresh in a moment." Multi-transaction flows show a checklist of their steps in this panel. About two seconds after success, return to the main view and refetch with \`?bust=1\`.
- **Validation:** check message/amount problems when the button is clicked and show the error inline (message errors under the textarea, everything else above the button) rather than disabling the button ahead of time. The exception is insufficient balance, which disables the button up front with a tooltip "You don't have enough ETH for this" and shows the low-balance notice.
- **Closing:** backdrop click and Escape close the modal -- except once the visitor has typed or changed something and no transaction is in flight, so a stray click can't throw away a drafted message.
- **Moderation:** flagged messages are left out of the lists entirely (see Moderation).

${markeeEstimateNote()}`
}

function fixedBuyFlowFragment(): string {
  const f = UI_COPY.fixedModal
  const r = UI_COPY.review
  return `## Buy modal views: For Sale

**Main view** -- title "${f.title}", or "${f.activateTitle}" while no message on the board has any funds yet.
- Rows: only messages with \`totalFundsAdded > 0\`, in \`getTopMarkees\` order. Amount column: total funds to 3 decimals ("0.006 ETH"). Buttons: "${f.edit}" (only on rows the connected wallet owns), then "${f.fund}" (every row).
- **Amount card:** the large editable amount followed by an "ETH" unit on the left; three small outlined preset buttons on the right in this order -- **MIN, MAX, WIN** (WIN's active state is gold, the others use the accent color). Second line: "≈ $X" on the left (if you have an ETH price), "Balance 0.123 ETH" on the right.
  - MIN = \`minimumPrice()\`. MAX = wallet balance − 0.0002 ETH gas reserve (6 decimals if under 0.001 ETH, otherwise 3). WIN = the top message's \`totalFundsAdded\` + 0.001 ETH; hide it when no message is funded yet or when that's below \`minimumPrice()\`.
  - Prefill WIN when it exists, otherwise MIN, until the visitor edits the field or picks a preset.
- Earned tile: "N ${f.earned}" for the amount entered.
- Primary button "${f.review}" -> review -> \`createMarkee(message, name)\` with \`value\` = amount. On click, require: connected, on Base, a non-empty message within \`maxMessageLength\`, amount ≥ \`minimumPrice()\`.

**Add Funds view** (from "${f.fund}") -- title "${f.addFundsTitle}".
- The target message in a bordered box with its meta line.
- The same amount card **without MIN**: MAX, and WIN = top total + 0.001 ETH − this message's own total. If this message is already #1, that button reads **2X** instead and fills this message's current total (adding it again doubles it). Prefill WIN/2X.
- The earned tile full-width under the amount card.
- Footer: "${f.split}" (with its tooltip) on the left, "${f.review}" on the right -> \`addFunds(markeeAddress)\` with \`value\` = amount.

**Edit Message view** (from "${f.edit}", owner only) -- title "${f.editTitle}". Free, so no amount card.
- "${f.currentMessage}" label over the current message box (with its meta line), then "${f.newMessage}" with a character counter and a three-row textarea.
- Footer: "${f.ownerOnly}" on the left, "${f.review}" on the right -> a review showing "${f.freeUpdate}" and "0 MARKEE" -> \`updateMessage(markeeAddress, newMessage)\`.

**Review outcome banner:** green "${r.fixedWin}" when the amount takes or keeps #1; otherwise red "${r.fixedLose} — needs X.XXX ETH to take the top spot", where X is the shortfall to WIN.

**Success headlines:** "Success! Your message is live" (new message), "Success! Funds added to the sign" (add funds), "Success! Your message is updated" (edit).`
}

function streamingBuyFlowFragment(): string {
  const s = UI_COPY.streamingModal
  const r = UI_COPY.review
  const d = UI_COPY.depositManager
  return `## Buy modal views: For Rent

Rates are entered in ETHx per month everywhere. Read \`backerMarkee(connectedWallet)\` as soon as a wallet connects -- it decides each row's button and which write flow each submit uses (see the contract section above).

**Main view** -- title "${s.title}".
- Rows: every message except the empty genesis seed and ones that were never funded, in \`getTopMarkees\` order. Amount column: the message's effective rate to 3 decimals ("0.004 ETH/mo"). Button: "${s.manage}" on the row the connected wallet currently backs, "${s.fund}" on every other row.
- **Rate card** -- three lines:
  1. The large editable rate followed by an "${s.unit}" unit; presets **MIN, WIN** on the right (no MAX). MIN = \`minimumMonthlyRate()\` rounded **up** to the nearest 0.001 ETH for display. WIN = the next whole multiple of the board minimum above the current #1: \`(floor(topMonthly / minMonthly) + 1) * minMonthly\`, where \`topMonthly = effectiveRate(topMarkee()) * 2_628_000\`. Prefill WIN when there's a funded #1, otherwise MIN.
  2. "≈ $X/mo" on the left; on the right "ETHx Balance 0.015" if the wallet holds any ETHx, otherwise "ETH Balance 0.123", with an info tip: "${d.balanceTip}"
  3. A divider, then "${s.depositManagerLink}" on the left (opens the Deposit Manager, below). On the right: when the auto-deposit (see "How much to wrap" above) is nonzero, the ETH this transaction will wrap ("0.0120 ETH", info tip "Your first transaction will deposit 0.0120 ETH as ETHx, enough to stream for 3mo 0d 0h. Go to the Deposit Manager to deposit a different amount than this."); otherwise the runway as "3mo 24d 10h" (info tip "How long your message can stream for based on your ETHx balance. To add more, go to the Deposit Manager.").
- Earned tile: "N ${s.earned}" for the rate entered.
- Primary button: "${s.buy}", or "Deposit 0.012 ${s.buyWithDeposit}" when the auto-deposit is nonzero -> review -> the brand-new-message sequence (createMarkee -> approve -> batch). Progress checklist: "${s.stepCreate}", "${s.stepApprove}", then "Deposit ETH & ${s.stepStart}" (or just "${s.stepStart}" when nothing is wrapped). Before any of it, apply the already-streaming block described in "Creating a message before backing it".

**Fund Message view** (from "${s.fund}") -- title "${s.fundTitle}".
- The target message box with a rank badge (gold outline when it's #1) and its meta line. If the connected wallet owns the message, a small pencil button edits its text inline: a textarea with "Save" / "Cancel", calling \`setMessage(newMessage)\` on the markee contract itself (not the board), then "✓ Message updated".
- The rate card (at #1, WIN reads **2X** and doubles this message's current rate), then the earned tile full-width.
- Footer: "62/38 split" on the left, "Review Payment Info" on the right. Submit uses the open-a-stream batch if the wallet backs nothing on this board, or the switch batch if it backs a different message. Checklist: "${s.stepApprove}", then "Deposit ETH & ${s.stepStart}" / "${s.stepStart}" (new stream) or "Deposit ETH & ${s.stepMove}" / "${s.stepMove}" (switch).

**Manage Your Stream view** (from "${s.manage}") -- title "${s.manageTitle}".
- "${s.messageFunding}" label (with the pencil edit if the wallet owns it) over the message box.
- A status box: a status dot and label -- **Active** (green: this message is #1 and the stream is paying), **Not Winning** (gold: the stream is open but refunded 100% while it isn't #1), **Stopped** (red: flow rate is 0) -- a rank badge, and "featured 3d 4h" while it holds #1. Then a stat grid: "${s.totalStreamed}" (ETH actually paid, net of refunds), "${s.ethxBalance}", "${s.runsOut}" ("~12.4 days"; red and bold under 7 days), and "MARKEE earned" (accrued so far). If this message has never been #1 and nothing has accrued, replace the grid with "${s.neverWon}" "${s.totalStreamed}" and "MARKEE earned" need the stream's event history; if you'd rather not replay those events, keep "${s.ethxBalance}" and "${s.runsOut}" and leave the other two out instead of estimating them.
- "${s.newRate}" label over the same rate card, prefilled with WIN (2X when already #1).
- Footer left: "${s.cancelStream}" (when Active) or "${s.cancelBid}" (when Not Winning) -> \`setFlowrate(ethx, board, 0)\` on the CFAv1Forwarder; after cancelling, if a deposit is still held: "${s.depositStays} ${s.depositManagerLink}". Footer right: "Review Payment Info", disabled with the tooltip "Enter a different rate" until the rate changes (or "Minimum is X ETH/mo" below the floor) -> the rate-update batch, checklist "${s.stepApprove}", "${s.stepUpdate}".

**Deposit Manager** (opened from any "${s.depositManagerLink}" link): a second modal stacked above the first, titled "${d.title}", with "← Back" closing just it.
- "${d.runsOut}" with an info tip "${d.runsOutTip}", a countdown formatted "2mo 14d 06h 42m 09s" that ticks every second, and a progress bar (full at 3 months or more; yellow under a week, red under a day). Hidden when nothing is streaming.
- An "${d.balance}" card (same info tip as the rate card): the balance, visibly decreasing at the wallet's outgoing stream rate; "${d.deposit}" and "${d.withdraw}" toggle buttons, where the selected one expands an amount input ("Amount to deposit (ETH)" / "Amount to withdraw (ETHx)") with "Wallet ETH: …" and "ETHx Balance: …" above it, and 1mo / 2mo / 3mo shortcuts (deposit, while streaming) or a percent-of-balance slider. Deposit = ETHx \`upgradeByETH()\` (payable); Withdraw = ETHx \`downgradeToETH(amount)\`. After confirmation: "✓ Deposit confirmed" (or "✓ Withdrawal confirmed") with a "View on Basescan ↗" link.
- Two tiles: "${d.streamingNow}" (green; total ETH/mo of the wallet's winning streams, "N messages winning") and "${d.notStreaming}" (total ETH/mo of its non-winning bids).
- "${d.yourStreams}": markee.xyz lists the wallet's streams across every board through a server endpoint that isn't open to other origins. Here, list this board's stream (a wallet has at most one per board: \`backerMarkee\` + \`getFlowrate\`), and add a "Manage all your Markee streams →" link to https://www.markee.xyz/account.

**Review outcome banner:** when the rate takes or keeps #1, green "${r.rentWin}" with the note "${r.rentWinNote}" Otherwise, gold "${r.rentLose}", then bold "Add X ETH/mo to take the top spot", then the note "${r.rentLoseNote}"

**Success headlines:** "Success! Your message is live" (new message), "Success! Funds added to the sign" (new stream to an existing message), "Success! Your stream moved to this message" (switch), "Success! Your rate is updated" (rate change).`
}

export function buyFlowFragment(strategy: EmbedStrategy): string {
  return `${buyModalShellFragment()}\n\n---\n\n${strategy === 'streaming' ? streamingBuyFlowFragment() : fixedBuyFlowFragment()}`
}

// ── Data fetching / proxy route ─────────────────────────────────────────────────
const PUBLIC_API_URL = 'https://markee.xyz/api/ecosystem/leaderboards'

export function proxyRouteFragment(framework: EmbedFramework, address: string): string {
  const commonNote = `Browser fetches to markee.xyz are blocked by CORS on most setups, so this needs a server-side hop. Find your leaderboard by matching \`address\` (case-insensitive) against "${address}" in the response. Useful fields: \`topMessage\`, \`topMessageOwner\`, \`topMarkeeAddress\`, and, only as a fallback for the trigger card's price pill until your on-chain reads land, \`topFundsAddedRaw\` (fixed: add 0.001 ETH to get the price to take #1) or \`effectiveRateRaw\` (streaming: the top message's own wei/sec rate) -- format either exactly as the trigger-card section describes. (\`minimumPrice\` is the floor for a brand-new message, not the price to take #1.) **Don't use \`streamedRateRaw\` as the price** -- that field is the board's total combined inflow across every backed message, not what it costs to take #1. A brand-new, not-yet-verified leaderboard won't appear in this response at all (verification gates the entire board out of this public listing, not just its top message -- see the note near the top of this prompt), so a live, paid message can legitimately render as "no data yet" here for a while. Have the trigger component fall back to a "be first!" empty state in that case, not an error -- it's expected, not a sign anything is broken.`

  if (framework === 'nextjs') {
    return `## Data fetching

${commonNote}

Create \`app/api/markee/leaderboards/route.ts\`:
\`\`\`ts
export async function GET(req: Request) {
  // Forward ?bust=1 from your own client (see "after a successful transaction" below) so a
  // post-purchase re-fetch can skip both this route's cache and markee.xyz's own upstream cache --
  // without it, a re-fetch right after a transaction can still return the pre-transaction value.
  const bust = new URL(req.url).searchParams.get('bust') === '1'
  const res = await fetch(\`${PUBLIC_API_URL}\${bust ? '?bust=1' : ''}\`, bust ? { cache: 'no-store' } : { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
  return Response.json(await res.json())
}
\`\`\`
Then fetch \`/api/markee/leaderboards\` (same-origin) from your client code, polling every 60s, and \`/api/markee/leaderboards?bust=1\` once right after a successful transaction.`
  }

  return `## Data fetching

${commonNote}

Add a minimal server-side proxy in ${FRAMEWORK_LABEL[framework]} -- a serverless function (Vercel/Netlify/Cloudflare function) is the lightest-weight option if you don't already run a backend:
\`\`\`
GET /api/markee/leaderboards            ->  fetch('${PUBLIC_API_URL}')          ->  return the JSON as-is
GET /api/markee/leaderboards?bust=1     ->  fetch('${PUBLIC_API_URL}?bust=1')   ->  return the JSON as-is, uncached
\`\`\`
Cache the non-\`bust\` response for ~60s (in-memory or your platform's edge cache); never cache the \`bust=1\` response. Fetch your own \`/api/markee/leaderboards\` endpoint from the client, polling on the same 60s interval, and hit the \`?bust=1\` variant once right after a successful transaction -- without it, that re-fetch can still return the pre-transaction value even seconds later, since it's passing through this cache and markee.xyz's own upstream cache.`
}

// ── View tracking ────────────────────────────────────────────────────────────
// Anti-spoofing hardening on the markee.xyz side is a separate, explicitly out-of-scope follow-up --
// this fragment documents today's real (simple) mechanism, not an aspirational one.
export function viewTrackingFragment(): string {
  return `## View tracking

Unlike the other endpoints in this prompt, **don't proxy this one** -- \`/api/views\` already sends \`Access-Control-Allow-Origin: *\`, so it's directly callable from the browser, and it needs to be: it dedupes by the *caller's* IP (1 increment per IP per markee per hour), and a server-side proxy would make every one of your visitors' views arrive from your server's single IP, collapsing your whole site's traffic into roughly one counted view per hour.

Call \`https://www.markee.xyz/api/views\` (the \`www\` subdomain specifically -- the bare \`markee.xyz\` apex redirects API routes to \`www\`, and a redirect on a CORS preflight fails in the browser rather than following it). Fire this once per session, the first time the top message renders. Include \`url: window.location.origin\` so markee.xyz can show which of your verified sites is actually getting traffic:
\`\`\`ts
const viewTracked = useRef(false)
useEffect(() => {
  if (!topMessage || !topMarkeeAddress || viewTracked.current) return
  viewTracked.current = true
  fetch('https://www.markee.xyz/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: topMarkeeAddress, message: topMessage, url: window.location.origin }),
  }).catch(() => {})
}, [topMessage, topMarkeeAddress])
\`\`\`
Safe to call on every page load -- the server-side dedup (keyed by the real visitor IP, which only works because this call comes straight from their browser) handles repeats.`
}

// ── Moderation ───────────────────────────────────────────────────────────────
export function moderationFragment(): string {
  return `## Moderation

Add a proxy route to fetch the flagged-content list:
\`\`\`ts
// app/api/markee/moderation/route.ts (adapt to your framework)
export async function GET() {
  const res = await fetch('https://markee.xyz/api/moderation', { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ flagged: [] })
  return Response.json(await res.json())
}
\`\`\`
Fetch this once on mount and build a Set:
\`\`\`ts
const [flagged, setFlagged] = useState<Set<string>>(new Set())
useEffect(() => {
  fetch('/api/markee/moderation').then(r => r.json()).then(d => setFlagged(new Set(d.flagged ?? []))).catch(() => {})
}, [])
const isFlagged = (markeeAddr: string) => flagged.has(\`8453:\${markeeAddr.toLowerCase()}\`)
\`\`\`
If the current top message is flagged, show "Content unavailable" instead of the text, but still let the modal open so visitors can buy a new top message. In any message-picker list, omit flagged entries entirely.`
}

// ── Health endpoint ─────────────────────────────────────────────────────────
// Backs the "Check View Tracking" / "Check Moderation" steps in the embed modal's verify flow
// (WebsiteEmbedWizard -> /api/openinternet/check-health). Optional by design -- those steps soft-pass
// if this endpoint is missing -- but without it they're not verifying anything real for this integrator.
export function healthEndpointFragment(): string {
  return `## Health endpoint (optional, powers Markee's embed verification)

Add this so the "Change the Markee Sign" embed-verification flow on markee.xyz can confirm your view-tracking and moderation proxy routes are wired up correctly:
\`\`\`ts
// app/api/markee/health/route.ts (adapt to your framework)
export async function GET() {
  return Response.json({
    overall: 'ok',
    checks: {
      leaderboards: { status: 'ok' },
      views: { status: 'ok' },
      moderation: { status: 'ok' },
    },
  })
}
\`\`\`
Skipping this is fine -- verification just skips those two checks rather than failing -- but it's a couple minutes of work for a real green checkmark instead of a skipped one.`
}

// ── Theme adoption ───────────────────────────────────────────────────────────
export function themeAdoptionFragment(): string {
  return `## Match this site's theme

Don't import Markee's own color palette. Before building the modal, read this site's existing design tokens -- Tailwind config, CSS custom properties, or whatever component library it already uses -- and reuse its actual colors, font, border-radius, and spacing scale. The modal should look like it was built for this site, not pasted in from another product. This is about *styling* only: the modal's structure, views, copy and flow still follow the buy-modal spec above exactly -- restyle markee.xyz's modal in this site's colors, don't redesign it. The one exception is the brand watermark described above -- its shape and hover behavior are a Markee requirement, only which of the two compositing variants (light or dark card background) applies is a choice.`
}

// ── Assembly ──────────────────────────────────────────────────────────────────
export function buildEmbedPrompt({ address, name, strategy, framework, wallet, agent }: BuildEmbedPromptInput): string {
  const buyUrl = `https://markee.xyz/markee/${address}`
  const sections = [
    coreIdentityFragment({ address, name, buyUrl, strategy }),
    triggerCardFragment(),
    walletFragment(wallet),
    strategyFragment(strategy, address),
    buyFlowFragment(strategy),
    proxyRouteFragment(framework, address),
    viewTrackingFragment(),
    moderationFragment(),
    healthEndpointFragment(),
    themeAdoptionFragment(),
    `## Implementation notes
- The \`data-markee-address="${address.toLowerCase()}"\` attribute must be present on the widget's server-rendered HTML for integration verification -- setting it only via \`useEffect\`/\`document.setAttribute()\` runs client-side only and won't be detected. This is the one hard requirement for the "Verify Embed" step on markee.xyz.
- Poll the leaderboard data every 60 seconds. After a successful transaction, re-fetch with \`?bust=1\` appended to your own proxy route's fetch of the upstream markee.xyz endpoint (and have your proxy forward it) -- the upstream data passes through multiple stacked ~60s server caches, so a plain re-fetch shortly after a transaction will very likely still return the pre-transaction value. \`?bust=1\` skips all of them for one request; don't pass it on regular page loads.
- Before creating any new file or route, check whether this repo already has one that does the same job (an existing API proxy layer, an existing env-var naming convention, an existing Superfluid/wallet setup) and extend that instead of assuming a blank slate -- these instructions describe the shape of what's needed, not a mandate to create every file listed here from scratch regardless of what's already present.
- Style to match this site's existing design system (see above) -- the pattern works with any CSS approach.

Please look at this codebase and implement the embed. Choose an appropriate location for the trigger (header, footer, sidebar widget). Match the existing code style, and keep it minimal.`,
  ]
  const intro = agent === 'other' ? '' : `<!-- Paste this into ${AGENT_LABEL[agent]} alongside this repo. -->\n\n`
  return intro + sections.join('\n\n---\n\n')
}
