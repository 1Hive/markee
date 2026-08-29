// Composable fragments for the Website embed AI-prompt wizard (EmbedModal -> WebsiteEmbedWizard).
//
// Each fragment is a small, independently-editable string builder instead of one giant static
// prompt. That's the actual fix for prompt content going stale silently: when BuyMessageModal's
// UX changes, only strategyFragment('fixed') needs updating, not a 500-line block buried in a
// modal component. Keep it that way -- do not collapse these back into one template literal.

export type EmbedFramework = 'nextjs' | 'react' | 'vue' | 'html' | 'other'
export type EmbedWallet = 'privy' | 'rainbowkit'
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
// The canonical-reference line is a deliberate steal from logo.dev's own quickstart prompt: a
// cheap hedge against exactly the kind of drift that prompted this rewrite in the first place.
export function coreIdentityFragment({ address, name, buyUrl }: { address: string; name?: string; buyUrl: string }): string {
  const displayName = name || address
  return `> **Canonical reference:** https://markee.xyz/docs
> If anything below is outdated or contradicts the live contracts/API, fetch that URL first -- it is the source of truth. Tell me if something looks stale.

# Markee embed setup

Markee is a protocol where anyone can pay ETH to set the featured message on a leaderboard. The highest total funder holds the top spot; anyone can outbid them to take it.

My leaderboard:
- Name: ${displayName}
- Address: ${address}
- Fallback buy page (works from anywhere, not required for the embedded flow below): ${buyUrl}

Build a fully embedded flow -- visitors buy, edit, and add funds to messages without ever leaving this site. Do not fall back to an iframe.`
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
- On hover: a pill badge slides up from the bottom-center edge showing the price/action --
  "X.XXX ETH to change" (fixed) or "X.XXX ETH/mo to back" (streaming), or "be first!" if there's no
  message yet. Fade in with a slight upward translate, not an instant show/hide.
- **Brand watermark (required on every integration, not optional styling):** a small, low-opacity
  "MARKEE" wordmark tucked into the card's top-left corner -- two stacked lines, "MAR" over "KEE",
  bold sans-serif (weight ~800), sized noticeably *smaller* than the message headline (roughly
  clamp(22px, 3vw, 34px) against a ~24-34px headline), at ~7% opacity. Keep it compact and pulled
  tight to the corner (a few px of negative offset, not more) -- it must stay clear of the message
  headline's own text, including where a long message wraps onto a second or third line. Oversizing
  this is the single most common mistake: at headline-matching or larger sizes it collides with the
  message text directly behind it and reads as noise instead of a subtle corner texture. It shares
  the hover pill's trigger -- fades in and out together with the pill, rather than sitting there
  permanently. Render it as plain text, not an image -- it inherits your color exactly and needs no
  external asset fetch:
  \`\`\`
  <div style="position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none; z-index:-1">
    <div style="position:absolute; top:-6px; left:-6px; font-weight:800; font-size:clamp(22px,3vw,34px); line-height:0.86; opacity:{hover ? 0.07 : 0}; transition:opacity 220ms; white-space:pre; color:{tint}">MAR{'\\n'}KEE</div>
  </div>
  \`\`\`
  This wrapper's own \`overflow:hidden\` does the clipping -- don't set it on the whole card, or the
  price pill (which intentionally bleeds past the card's bottom edge) gets cut off too. Give the card
  container an explicit \`z-index\` (not just \`position: relative\`) so the watermark's negative
  z-index stays contained instead of escaping behind your page's own background -- position +
  z-index together is what actually creates a new stacking context; position alone doesn't.
  Tint: white on dark/black card backgrounds, near-black on light/white backgrounds, or Markee's own
  purple (#7B6AF4) if your card background sits in between -- pick whichever reads as a faint accent
  against your own card's actual background, not a fixed choice.
- Card container: rounded corners (12-16px), a subtle 1px border that brightens on hover, slight lift
  (translateY(-2px)) + shadow-on-hover, backdrop blur if your design system already uses
  glassmorphism.

This card is also the click target that opens the buy modal below.`
}

// ── Wallet setup ──────────────────────────────────────────────────────────────
// wagmi + viem is the one non-negotiable base under either choice -- every contract-call fragment
// below assumes it. Don't pre-detect whether it's already installed; let the agent figure that out
// from the target repo.
export function walletFragment(wallet: EmbedWallet): string {
  if (wallet === 'privy') {
    return `## Wallet connection: Privy

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

Requires: \`@rainbow-me/rainbowkit\`, \`wagmi\`, \`viem\`, \`@tanstack/react-query\`.

Provider order matters:
\`WagmiProvider\` -> \`QueryClientProvider\` -> \`RainbowKitProvider\`.

wagmi config: \`getDefaultConfig({ appName, projectId, chains: [base], ssr: true })\`. Set \`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID\` (get a free ID at cloud.walletconnect.com).

Connect button: RainbowKit's own \`<ConnectButton />\`, or \`useConnectModal()\` if you need to open it programmatically. If you're triggering it from inside your own buy modal, close your modal first (\`useConnectModal()\`'s dialog otherwise ends up stacked behind it) and reopen yours once the connect modal closes.

Chain: Base (chainId 8453).`
}

// ── Strategy-specific contract interaction ─────────────────────────────────────
// Fixed: TopDawgPartnerStrategy-family contract (deployed via LeaderboardFactory) -- the same
// contract BuyMessageModal already talks to. Keep this in sync with components/modals/BuyMessageModal.tsx.
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

To outbid the current #1: \`topFundsAdded + 1000000000000000n\` wei (0.001 ETH minimum increment). If there's no top message yet, use \`minimumPrice()\`.

### Buy flow UX (match this, don't invent your own layout)

One modal, three modes depending on whether the connected wallet already owns a message on this board:
- **Create** (no message owned yet): message textarea (char counter against \`maxMessageLength\`) + optional name input, then an amount card.
- **Add Funds** (owns a message): read-only display of the current message, then the same amount card.
- **Update Message** (owns a message): current message shown read-only above a new-message textarea. No payment -- this is a free call.

If the wallet owns a message, show both **Add Funds** and **Update Message** as tabs; default to Add Funds.

Amount card (Create / Add Funds only): a large editable ETH amount input with three preset buttons to its right, in this exact order -- **MIN, MAX, WIN** (WIN reads "2X" instead when the wallet already holds the top spot: \`2 * theirCurrentTotal\`). MIN fills \`minimumPrice()\`, MAX fills the connected wallet's spendable balance (balance minus a small gas reserve, e.g. 0.0002 ETH), WIN fills the amount needed to take #1 (hidden if the wallet already holds it). Below the input: a live USD equivalent (if you have a price feed) and the connected balance.

Below the amount card, a highlighted "You'll receive N MARKEE" estimate -- MARKEE tokens are minted by Markee's Revnet at the current issuance rate on every payment; if you don't have that rate, omit the estimate rather than guessing.

Footer: submit button labeled "Buy Message" (Create), "Add Funds" (Add Funds), or "Update Message" (Update Message) -- disabled while pending or over the balance. Below it, one line: "62% to the sign's beneficiary, 38% to Markee's Revnet."

Low-balance state: an inline banner, not just a disabled button -- see the wallet-connection fragment above for the funding-flow hook to attach to it.`
}

// Streaming: Superfluid CFA/GDA under a custom StreamingLeaderboard contract. This is materially
// more involved than the fixed flow and genuinely Markee-specific (buffer deposits, markee-tagged
// flows, a mandatory GDA pool connect) -- a generic "use the Superfluid SDK" pointer is not enough,
// because the SDK's plain createFlow doesn't know about our buffer/pool/tagging requirements. Give
// the real operation sequence, mirroring lib/superfluid/streaming.ts.
function streamingStrategyFragment(address: string): string {
  return `## Contract interaction: For Rent (streaming)

This leaderboard uses a streaming strategy built on Superfluid: backers pay a continuous ETHx flow rate (ETH/month) instead of a lump sum, and the top spot is held by whoever's cumulative stream is largest. Backing costs nothing upfront beyond a small refundable deposit -- payment only accrues while your message is live.

This is more involved than a normal payable call. Don't reach for a generic Superfluid SDK snippet here -- our contract wraps CFA/GDA with buffer deposits and per-message pools, and the SDK's plain \`createFlow\` doesn't know about that. Use the exact operation sequence below.

Leaderboard contract: ${address} (Base, chainId 8453)
Superfluid contracts (Base): host \`0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74\`, ETHx (super token) \`0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93\`, CFAv1Forwarder \`0xcfA132E353cB4E398080B9700609bb008eceB125\`

Reads:
- \`minimumMonthlyRate() view -> uint256\` (wei/month floor)
- \`backerMarkee(address) view -> address\` -- which message an address currently backs, if any
- \`backerDeposit(address) view -> uint256\`
- \`poolOf(markeeAddress) view -> address\` -- the GDA refund pool for a given message (needed below)
- CFAv1Forwarder's \`getFlowrate(token, sender, receiver) view -> int96\` -- cheaper read than going through the host

Resolve the CFA and GDA agreement class addresses dynamically via \`host.getAgreementClass(agreementId)\` rather than hardcoding them -- Superfluid can redeploy agreement classes.

### Opening or updating a stream

Four batched operations via \`host.batchCall(operations[])\`, in this exact order:
1. **Wrap** -- \`ETHx.upgradeByETHTo(backer)\`, payable with the ETH you're sending in. Must run first so the host's ETH balance is drained before the later value-0 forwards.
2. **Deposit buffer** -- \`board.depositBuffer(backer, bufferAmount)\`, forwarded to the backer. Superfluid requires a security deposit (~4x the monthly rate) on top of the money that actually streams.
3. **Create or update the flow** -- \`cfa.createFlow(ethx, board, ratePerSec, ctx)\` (or \`updateFlow\` if this backer already has an open stream to this board), called as an agreement operation with the target *markee* address ABI-encoded into \`userData\` so the board's callback can associate the flow with the right message.
4. **Connect the pool** -- \`gda.connectPool(poolOf(markee), ctx)\`, called as an agreement operation. **This is not optional**: an unconnected backer's wallet drains at the full stream rate while their refund accrues unclaimed in the pool, which can get them liquidated even though they're technically being refunded.

Important: the ERC20 \`approve\` that authorizes step 2's pull must be sent as its **own transaction beforehand**, not batched in -- operations forwarded through the batch run with the forwarder contract as \`msg.sender\`, so an in-batch approve would authorize the wrong account.

Monthly-rate math: \`ratePerSec = weiPerMonth / 2_628_000\` (2,628,000 seconds/month), rounded up so the effective monthly cost never comes in under what was quoted.

### Buy flow UX (match this, don't invent your own layout)

Same three-mode shape as the fixed-strategy flow (create / add-funds-equivalent / update-message), but the amount card shows an ETH/month rate instead of a lump sum, with **MIN, MAX, WIN** presets: MIN = \`minimumMonthlyRate()\`, MAX = spendable balance divided by however many months of runway you're asking the visitor to fund upfront, WIN = the rate needed to overtake the current top stream. Show the estimated runway ("~N days at this rate") next to the amount. Submit button: "Start Streaming" (new) or "Update Rate" (existing backer).`
}

export function strategyFragment(strategy: EmbedStrategy, address: string): string {
  return strategy === 'streaming' ? streamingStrategyFragment(address) : fixedStrategyFragment(address)
}

// ── Data fetching / proxy route ─────────────────────────────────────────────────
const PUBLIC_API_URL = 'https://markee.xyz/api/ecosystem/leaderboards'

export function proxyRouteFragment(framework: EmbedFramework, address: string): string {
  const commonNote = `Browser fetches to markee.xyz are blocked by CORS on most setups, so this needs a server-side hop. Find your leaderboard by matching \`address\` (case-insensitive) against "${address}" in the response. Useful fields: \`topMessage\`, \`topMessageOwner\`, \`topFundsAddedRaw\`, \`minimumPrice\` (fixed) / \`streamedRateRaw\` (streaming), \`topMarkeeAddress\`.`

  if (framework === 'nextjs') {
    return `## Data fetching

${commonNote}

Create \`app/api/markee/leaderboards/route.ts\`:
\`\`\`ts
export async function GET() {
  const res = await fetch('${PUBLIC_API_URL}', { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
  return Response.json(await res.json())
}
\`\`\`
Then fetch \`/api/markee/leaderboards\` (same-origin) from your client code, polling every 60s.`
  }

  return `## Data fetching

${commonNote}

Add a minimal server-side proxy in ${FRAMEWORK_LABEL[framework]} -- a serverless function (Vercel/Netlify/Cloudflare function) is the lightest-weight option if you don't already run a backend:
\`\`\`
GET /api/markee/leaderboards  ->  fetch('${PUBLIC_API_URL}')  ->  return the JSON as-is
\`\`\`
Cache the upstream response for ~60s (in-memory or your platform's edge cache) and fetch your own \`/api/markee/leaderboards\` endpoint from the client, polling on the same interval.`
}

// ── View tracking ────────────────────────────────────────────────────────────
// Anti-spoofing hardening on the markee.xyz side is a separate, explicitly out-of-scope follow-up --
// this fragment documents today's real (simple) mechanism, not an aspirational one.
export function viewTrackingFragment(): string {
  return `## View tracking

Add a proxy route to forward view increments (same CORS reasoning as data fetching):

\`\`\`ts
// app/api/markee/views/route.ts (adapt the path/syntax to your framework)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.address || !body?.message) return Response.json({ error: 'Missing fields' }, { status: 400 })
  const res = await fetch('https://markee.xyz/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return Response.json(await res.json())
}
\`\`\`

Fire this once per session, the first time the top message renders. Include \`url: window.location.origin\` so markee.xyz can show which of your verified sites is actually getting traffic:
\`\`\`ts
const viewTracked = useRef(false)
useEffect(() => {
  if (!topMessage || !topMarkeeAddress || viewTracked.current) return
  viewTracked.current = true
  fetch('/api/markee/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: topMarkeeAddress, message: topMessage, url: window.location.origin }),
  }).catch(() => {})
}, [topMessage, topMarkeeAddress])
\`\`\`
Rate-limited server-side to 1 increment per IP per markee per hour, so calling this on every page load is safe.`
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

Don't import Markee's own color palette. Before building the modal, read this site's existing design tokens -- Tailwind config, CSS custom properties, or whatever component library it already uses -- and reuse its actual colors, font, border-radius, and spacing scale. The modal should look like it was built for this site, not pasted in from another product. The one exception is the brand watermark described above -- its shape and hover behavior are a Markee requirement, only its tint color adapts to your theme.`
}

// ── Assembly ──────────────────────────────────────────────────────────────────
export function buildEmbedPrompt({ address, name, strategy, framework, wallet, agent }: BuildEmbedPromptInput): string {
  const buyUrl = `https://markee.xyz/markee/${address}`
  const sections = [
    coreIdentityFragment({ address, name, buyUrl }),
    triggerCardFragment(),
    walletFragment(wallet),
    strategyFragment(strategy, address),
    proxyRouteFragment(framework, address),
    viewTrackingFragment(),
    moderationFragment(),
    healthEndpointFragment(),
    themeAdoptionFragment(),
    `## Implementation notes
- The \`data-markee-address="${address.toLowerCase()}"\` attribute must be present on the widget's server-rendered HTML for integration verification -- setting it only via \`useEffect\`/\`document.setAttribute()\` runs client-side only and won't be detected. This is the one hard requirement for the "Verify Embed" step on markee.xyz.
- Poll the leaderboard data every 60 seconds; re-fetch immediately (with a ~3s delay for the transaction to index) after a successful transaction.
- Style to match this site's existing design system (see above) -- the pattern works with any CSS approach.

Please look at this codebase and implement the embed. Choose an appropriate location for the trigger (header, footer, sidebar widget). Match the existing code style, and keep it minimal.`,
  ]
  const intro = agent === 'other' ? '' : `<!-- Paste this into ${AGENT_LABEL[agent]} alongside this repo. -->\n\n`
  return intro + sections.join('\n\n---\n\n')
}
