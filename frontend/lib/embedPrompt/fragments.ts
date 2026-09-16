// Composable fragments for the Website embed AI-prompt wizard (EmbedModal -> WebsiteEmbedWizard).
//
// Each fragment is a small, independently-editable string builder instead of one giant static
// prompt. That's the actual fix for prompt content going stale silently: when BuyMessageModal's
// UX changes, only strategyFragment('fixed') needs updating, not a 500-line block buried in a
// modal component. Keep it that way -- do not collapse these back into one template literal.

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
    ? 'the streaming contract at `contracts/v1.3/streaming/StreamingLeaderboard.sol` and the reference frontend implementation under `frontend/lib/superfluid/streaming.ts` and `frontend/hooks/use*StreamFlow.ts`'
    : 'the leaderboard contract at `contracts/v1.3/Leaderboard.sol` and the reference frontend implementation at `frontend/components/modals/BuyMessageModal.tsx`'
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
- On hover: a pill badge slides up from the bottom-center edge showing the price/action --
  "X.XXX ETH to change" (fixed) or "X.XXX ETH/mo to back" (streaming), or "be first!" if there's no
  message yet. Fade in with a slight upward translate, not an instant show/hide.
- **Brand watermark (required on every integration, not optional styling):** the real Markee logo,
  translucent, centered in the trigger card behind the message text -- not recreated
  letterforms (an earlier version of this spec tried approximating "MAR"/"KEE" as plain text in a
  guessed font and the two words visibly mismatched in weight) and not blend-mode or CSS-mask tricks
  to hide the logo's own background (earlier versions of this spec tried that too, chasing a
  corner-bled placement that collided with message text and, for the masked version, ran into
  inconsistent real-world support for the CSS \`mask-mode\` property that made it render as nothing
  at all). Use the light or dark logo mark -- **not the purple one** -- picking whichever actually
  reads against the card's own background, the same background you already identified while matching
  this site's theme (see below): a light card background -> \`https://markee.xyz/markee-logo-dark.png\`
  (near-black mark), a dark card background -> \`https://markee.xyz/markee-logo-light.png\` (near-white
  mark). If this card's background switches with the site's own light/dark mode, swap the watermark's
  \`src\` alongside whatever mechanism you already used to make the rest of the modal theme-aware (a
  \`data-theme\` attribute, a dark-mode class, a \`prefers-color-scheme\` media query) rather than
  picking one variant and leaving it fixed:
  \`\`\`
  <div style="position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none; z-index:-1; display:flex; align-items:center; justify-content:center">
    <img src="https://markee.xyz/markee-logo-dark.png" alt="" aria-hidden style="
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

This site doesn't have a wallet library installed. Either of these works well for an embed like this
-- pick whichever fits your audience, then follow that library's own docs for provider setup. The
rest of this prompt (contract calls, data fetching, moderation) doesn't depend on which one you pick:

- **Privy** -- simplest to get working cold. Includes an embedded wallet and card-funding out of the
  box, so visitors who don't already have a crypto wallet can still pay. Good default if you're not
  sure.
- **RainbowKit** -- lighter footprint, assumes visitors bring their own wallet (MetaMask, Rabby, etc.)
  via WalletConnect. Better fit for a crypto-native audience.

Both need \`wagmi\` + \`viem\` underneath, targeting Base (chainId 8453). If you pick Privy, requires
\`@privy-io/react-auth\` + \`@privy-io/wagmi\`; if RainbowKit, \`@rainbow-me/rainbowkit\` +
\`@tanstack/react-query\`. Set up the provider stack and a connect button per that library's docs
before wiring in the buy flow below.`
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

This leaderboard uses a streaming strategy built on Superfluid: backers pay a continuous ETHx flow rate (ETH/month) instead of a lump sum. The top spot is held by whoever's *current rate* is highest -- promotion is automatic (it flips inside the contract's own inflow callback the instant a challenger's rate clears the incumbent's), but **demotion is not**: if the top backer's rate drops, the contract only heals the ranking when someone calls the permissionless \`claimTop(challengerMarkee)\` on the new-rightful #1. Call it yourself right after any rate change that could affect ranking (yours or, if you're polling, anyone's) -- don't assume the top spot updates on its own.

This is more involved than a normal payable call, and it does not compose the way a generic Superfluid SDK snippet assumes. Don't reach for \`sf.cfaV1.createFlow\` or similar -- our contract wraps CFA/GDA with buffer deposits and per-message pools, tags every flow with the target message via \`userData\`, and behaves differently on create vs. update in a way that will silently misroute a payment if you guess. Use the exact sequences below.

Leaderboard contract: ${address} (Base, chainId 8453)
Superfluid contracts (Base): host \`0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74\`, ETHx (super token) \`0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93\`, CFAv1Forwarder \`0xcfA132E353cB4E398080B9700609bb008eceB125\`

Reads:
- \`minimumMonthlyRate() view -> uint256\` (wei/month floor)
- \`backerMarkee(address) view -> address\` -- which message an address currently backs, if any. **A backer can only ever stream to one message on a given board at a time** -- Superfluid's CFA allows exactly one flow per (sender, receiver) pair, and the receiver here is always the board contract itself, not the individual message. Before opening a new stream, check this (or the CFAv1Forwarder read below) and branch into "update rate" or "switch message" instead, per the flows below.
- \`backerDeposit(address) view -> uint256\`
- \`poolOf(markeeAddress) view -> address\` -- the GDA refund pool for a given message (needed below)
- \`topMarkee() view -> address\` / \`topRate() view -> uint256\` -- the contract's own enforced #1 and its rate. Use these for "what does changing the top message cost", not \`getTopMarkees\`, which recomputes live ranking and can disagree with the enforced #1 during the (usually brief) window before a pending \`claimTop\` heals it.
- CFAv1Forwarder's \`getFlowrate(token, sender, receiver) view -> int96\` -- cheaper read than going through the host; also how you detect an existing stream to gate the create-vs-update-vs-switch branch above.

Resolve the CFA and GDA agreement class addresses dynamically via \`host.getAgreementClass(agreementId)\` rather than hardcoding them -- Superfluid can redeploy agreement classes.

### Creating a message before backing it

Backing only works on a message that already exists on this board. If the visitor is backing a brand-new message (not adding to or switching between existing ones), create it first, as its own transaction, before any of the streaming batches below:
\`\`\`
board.createMarkee(message, name) -> markeeAddress   // no payment -- creates the message, unfunded
\`\`\`
This emits \`MarkeeCreated(markeeAddress, owner, message, name)\`; decode the new address from the receipt logs (or from \`markees(markees.length - 1)\`). Skipping this and streaming straight to an address that was never created reverts with \`UnknownMarkee\` -- the board's inbound-flow callback checks \`isMarkeeOnLeaderboard[markee]\` before accepting anything.

The pool for the new message is created in the same \`createMarkee\` transaction, but RPC nodes can lag a block or two behind -- poll \`poolOf(markeeAddress)\` until it's non-zero before including it in the batch below, rather than reading it once and assuming it's ready.

So the full "back a brand-new message" sequence is three separate transactions: **createMarkee → approve → batchCall (below)**, not one.

### Opening a stream (first stream to this board)

Batched via \`host.batchCall(operations[])\`, in this exact order:
1. **Wrap** (only if needed) -- \`ETHx.upgradeByETHTo(backer)\`, payable with the ETH you're sending in. Must run first when present so the host's ETH balance is drained before the later value-0 forwards. **Omit this op entirely** if the backer's existing ETHx balance already covers what's needed below -- \`upgradeByETH\` reverts on a zero amount, it isn't safe to always include with value 0.
2. **Deposit buffer** -- \`board.depositBuffer(backer, bufferAmount)\`, forwarded to the backer, where \`bufferAmount = ratePerSec * 14400\`. That constant is Base Superfluid's liquidation period in seconds -- **4 hours of the stream's own per-second rate, not "4x the monthly rate"** (those numbers differ by a factor of ~730). Read it from the board's \`BUFFER_PERIOD\` rather than hardcoding, in case it's ever reconfigured.
3. **Create the flow** -- \`cfa.createFlow(ethx, board, ratePerSec, ctx)\`, called as an agreement operation with the target *markee* address ABI-encoded into \`userData\` so the board's callback can associate the flow with the right message. This only works for a backer's **first** stream to this board -- see "Updating your rate" and "Switching which message you back" below for an existing backer.
4. **Connect the pool** -- \`gda.connectPool(poolOf(markee), ctx)\`, called as an agreement operation. **This is not optional**: an unconnected backer's wallet drains at the full stream rate while their refund accrues unclaimed in the pool, which can get them liquidated even though they're technically being refunded.

How much to wrap: the deposit buffer above, plus however much runway (ETHx) you want the stream funded with up front -- e.g. 3 months at the chosen rate is a reasonable default. If the backer already holds enough ETHx to cover both, skip the wrap op (see step 1).

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

### What this embed does not need to build

Nothing on markee.xyz's own frontend currently exposes "stop streaming" or \`withdrawDeposit()\` as UI -- there's no reference implementation to mirror, and it's fine to leave both out of a first pass. If you do add them: a backer stops paying by driving their flow rate to \`0\` via the CFA forwarder's \`setFlowrate(ethx, board, 0)\` (equivalent to \`deleteFlow\`), and \`withdrawDeposit()\` on the board reclaims buffer no longer needed (everything, once no stream is open; the surplus above \`rate * BUFFER_PERIOD\` otherwise).

### Buy flow UX (match this, don't invent your own layout)

Before rendering the flow, check \`backerMarkee(connectedAddress)\` against this board: it determines which of three cases you're in.
- **No existing stream on this board**: message textarea (char counter against \`maxMessageLength\`) + optional name input if backing a brand-new message (runs \`createMarkee\` first, see above) -- or skip straight to the amount card if backing an existing message. Amount card shows an ETH/month rate with **MIN, MAX, WIN** presets: MIN = \`minimumMonthlyRate()\`, MAX = spendable balance divided by however many months of runway you're asking the visitor to fund upfront, WIN = the rate needed to overtake \`topRate()\` (hidden if backing the current #1 already). Submit: "Start Streaming" → the opening-a-stream batch above.
- **Already backing this exact message**: same amount card, prefilled with the current rate. Submit: "Update Rate" → the rate-update flow above.
- **Already backing a different message on this board**: same amount card, but submitting switches the stream to the new message via the switch flow above, not a rate update. Submit: "Switch & Fund" (or similar -- make it clear this moves the existing stream, it does not add a second one).

Show the estimated runway ("~N days at this rate", from the prefund ETHx balance divided by the rate) next to the amount input in every case.`
}

export function strategyFragment(strategy: EmbedStrategy, address: string): string {
  return strategy === 'streaming' ? streamingStrategyFragment(address) : fixedStrategyFragment(address)
}

// ── Data fetching / proxy route ─────────────────────────────────────────────────
const PUBLIC_API_URL = 'https://markee.xyz/api/ecosystem/leaderboards'

export function proxyRouteFragment(framework: EmbedFramework, address: string): string {
  const commonNote = `Browser fetches to markee.xyz are blocked by CORS on most setups, so this needs a server-side hop. Find your leaderboard by matching \`address\` (case-insensitive) against "${address}" in the response. Useful fields: \`topMessage\`, \`topMessageOwner\`, \`topMarkeeAddress\`, and the price to display -- \`minimumPrice\` (fixed) or, for streaming, \`topRateRaw\`/\`effectiveRateRaw\` (the top message's own wei/sec rate). **Don't use \`streamedRateRaw\` as the price** -- that field is the board's total combined inflow across every backed message, not what it costs to take #1. A brand-new, not-yet-verified leaderboard won't appear in this response at all (verification gates the entire board out of this public listing, not just its top message -- see the note near the top of this prompt), so a live, paid message can legitimately render as "no data yet" here for a while. Have the trigger component fall back to a "be first!" empty state in that case, not an error -- it's expected, not a sign anything is broken.`

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

Don't import Markee's own color palette. Before building the modal, read this site's existing design tokens -- Tailwind config, CSS custom properties, or whatever component library it already uses -- and reuse its actual colors, font, border-radius, and spacing scale. The modal should look like it was built for this site, not pasted in from another product. The one exception is the brand watermark described above -- its shape and hover behavior are a Markee requirement, only which of the two compositing variants (light or dark card background) applies is a choice.`
}

// ── Assembly ──────────────────────────────────────────────────────────────────
export function buildEmbedPrompt({ address, name, strategy, framework, wallet, agent }: BuildEmbedPromptInput): string {
  const buyUrl = `https://markee.xyz/markee/${address}`
  const sections = [
    coreIdentityFragment({ address, name, buyUrl, strategy }),
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
- Poll the leaderboard data every 60 seconds. After a successful transaction, re-fetch with \`?bust=1\` appended to your own proxy route's fetch of the upstream markee.xyz endpoint (and have your proxy forward it) -- the upstream data passes through multiple stacked ~60s server caches, so a plain re-fetch shortly after a transaction will very likely still return the pre-transaction value. \`?bust=1\` skips all of them for one request; don't pass it on regular page loads.
- Before creating any new file or route, check whether this repo already has one that does the same job (an existing API proxy layer, an existing env-var naming convention, an existing Superfluid/wallet setup) and extend that instead of assuming a blank slate -- these instructions describe the shape of what's needed, not a mandate to create every file listed here from scratch regardless of what's already present.
- Style to match this site's existing design system (see above) -- the pattern works with any CSS approach.

Please look at this codebase and implement the embed. Choose an appropriate location for the trigger (header, footer, sidebar widget). Match the existing code style, and keep it minimal.`,
  ]
  const intro = agent === 'other' ? '' : `<!-- Paste this into ${AGENT_LABEL[agent]} alongside this repo. -->\n\n`
  return intro + sections.join('\n\n---\n\n')
}
