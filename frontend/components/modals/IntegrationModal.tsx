'use client'

import { useState, useEffect } from 'react'
import { X, Copy, Check, Code2, Globe2, Monitor, CheckCircle2, Sparkles, AlertTriangle, Info } from 'lucide-react'

type Tab = 'prompt' | 'snippet' | 'iframe' | 'modal'

interface IntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  leaderboard: {
    address: string
    name: string
    verifiedUrls?: string[]
    status?: 'pending' | 'verified'
  }
  onOpenVerify?: () => void
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-10">
        <CopyButton text={code} />
      </div>
      <pre className="bg-[#060A2A] border border-[#8A8FBF]/15 rounded-lg p-4 pr-20 text-xs text-[#EDEEFF] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

export function IntegrationModal({ isOpen, onClose, leaderboard, onOpenVerify }: IntegrationModalProps) {
  const [tab, setTab] = useState<Tab>('modal')
  const [snippetLang, setSnippetLang] = useState<'react' | 'vanilla'>('react')
  const [platform, setPlatform] = useState<'vercel' | 'unknown' | null>(null)
  const [moderationStatus, setModerationStatus] = useState<'ok' | 'error' | null>(null)

  const verifiedUrl = leaderboard.verifiedUrls?.[0]

  useEffect(() => {
    if (!verifiedUrl) return
    const params = new URLSearchParams({ url: verifiedUrl })
    fetch(`/api/openinternet/check-health?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.platform) setPlatform(d.platform)
        if (d.checks?.moderation?.status) setModerationStatus(d.checks.moderation.status === 'ok' ? 'ok' : 'error')
      })
      .catch(() => {})
  }, [verifiedUrl])

  const { address, name } = leaderboard
  const lowerAddress = address.toLowerCase()
  const buyUrl = `https://markee.xyz/ecosystem/website/${address}`
  const embedUrl = `https://markee.xyz/api/embed/${address}`
  const apiUrl = `https://markee.xyz/api/openinternet/leaderboards`
  const dataAttr = `data-markee-address="${lowerAddress}"`

  const aiPrompt = `I want to add a Markee widget to my website.

Markee is a protocol where anyone can pay ETH to set the message displayed on my site. The person who pays the most gets the featured spot. Anyone can pay more to take the featured message.

My leaderboard:
- Name: ${name}
- Address: ${address}
- Buy page (where visitors go to buy a message): ${buyUrl}

Step 1: Fetch the current top message.

IMPORTANT: Do not fetch the Markee API directly from the browser -- it will be blocked by CORS on most hosting setups.

If this is a Next.js site, create a proxy API route first:

// app/api/markee/leaderboards/route.ts
export async function GET() {
  const res = await fetch('${apiUrl}', { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
  return Response.json(await res.json())
}

Then fetch from your own route:
GET /api/markee/leaderboards

If this is a static site (plain HTML, Vite, CRA with no SSR), use the iframe embed instead -- it has no CORS issues:
<div ${dataAttr}>
  <iframe src="https://markee.xyz/api/embed/${address}" width="100%" height="80" frameborder="0"></iframe>
</div>

Step 2: Find this leaderboard in the response:
Look for the entry where address matches "${address}" (case-insensitive).
Relevant fields: topMessage, topMessageOwner, topFundsAddedRaw, minimumPrice, totalFunds

Step 3: Display it on my site:
- Wrap the widget container with the attribute: ${dataAttr}
- If topFundsAddedRaw is "0" or topMessage is null, no message has been purchased yet -- show a placeholder like "No message yet" or hide the widget entirely
- Show topMessage prominently inside the wrapper
- Link "Change this message" to ${buyUrl}
- Re-fetch every 60 seconds to stay current
- Optionally show topMessageOwner: this is the message owner's name or address. If it starts with "0x" truncate it (e.g. 0x1234...abcd). Otherwise display it as-is.

The data-markee-address attribute on the wrapper is required for integration verification. It must be present in the server-rendered HTML.
- Next.js: placing the attribute in JSX works even in a "use client" component -- Next.js SSRs client components into the initial HTML. The only thing to avoid is adding it exclusively via useEffect or document.setAttribute(), which runs after page load and will not be detected.
- Plain SPA (Vite, Create React App with no SSR): add the attribute to a static element in your index.html instead, since React-rendered HTML is not present in the server response.

Please look at this codebase and implement the integration. Choose an appropriate location (footer, header banner, sidebar widget). Match the existing code style. Keep it minimal.`

  const reactSnippet = `// Step 1: app/api/markee/leaderboards/route.ts
// Proxy route -- fetches server-side so CORS is never an issue.
export async function GET() {
  const res = await fetch('${apiUrl}', { next: { revalidate: 60 } })
  if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
  return Response.json(await res.json())
}

// Step 2: components/MarkeeWidget.tsx
'use client'

import { useState, useEffect } from 'react'

const LEADERBOARD_ADDRESS = '${address}'
const BUY_URL = '${buyUrl}'

export function MarkeeWidget() {
  const [message, setMessage] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)

  async function fetchMessage() {
    try {
      const res = await fetch('/api/markee/leaderboards')
      const json = await res.json()
      const lb = json.leaderboards?.find(
        (l: any) => l.address.toLowerCase() === LEADERBOARD_ADDRESS.toLowerCase()
      )
      if (lb?.topMessage) {
        setMessage(lb.topMessage)
        setOwner(lb.topMessageOwner ?? null)
      }
    } catch {}
  }

  useEffect(() => {
    fetchMessage()
    const interval = setInterval(fetchMessage, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!message) return null

  const ownerDisplay = owner
    ? owner.startsWith('0x')
      ? \`\${owner.slice(0, 6)}...\${owner.slice(-4)}\`
      : owner
    : null

  return (
    <div data-markee-address={LEADERBOARD_ADDRESS} className="markee-widget">
      <p>{message}</p>
      {ownerDisplay && <p className="markee-owner">{ownerDisplay}</p>}
      <a href={BUY_URL} target="_blank" rel="noopener noreferrer">
        Change this message
      </a>
    </div>
  )
}`

  const vanillaSnippet = `<!--
  NOTE: Browser fetches to markee.xyz are blocked by CORS on most setups.
  If you have a backend (Node, PHP, etc.) create a proxy endpoint that
  fetches ${apiUrl} server-side and re-serves the JSON, then replace
  the fetch URL below with your proxy URL.

  For static sites (no backend), use the iFrame tab instead -- it has
  no CORS issues and requires zero JavaScript.
-->

<!-- Add where you want the widget. The data attribute is required for verification -->
<div id="markee-widget" ${dataAttr}></div>

<!-- Add before </body>. Replace /api/markee/leaderboards with your proxy URL. -->
<script>
  (function () {
    var ADDRESS = '${address}';
    var BUY_URL = '${buyUrl}';

    function fetchMessage() {
      fetch('/api/markee/leaderboards')
        .then(function (r) { return r.json(); })
        .then(function (json) {
          var lb = (json.leaderboards || []).find(function (l) {
            return l.address.toLowerCase() === ADDRESS.toLowerCase();
          });
          if (!lb || !lb.topMessage) return;
          var rawOwner = lb.topMessageOwner || '';
          var owner = rawOwner.startsWith('0x')
            ? rawOwner.slice(0, 6) + '...' + rawOwner.slice(-4)
            : rawOwner;
          var el = document.getElementById('markee-widget');
          if (!el) return;
          el.innerHTML =
            '<p>' + lb.topMessage + '</p>' +
            (owner ? '<p>' + owner + '</p>' : '') +
            '<a href="' + BUY_URL + '" target="_blank">Change this message</a>';
        });
    }

    fetchMessage();
    setInterval(fetchMessage, 60000);
  })();
<\/script>`

  const iframeSnippet = `<!-- Wrap the iframe with data-markee-address for verification -->
<div ${dataAttr}>
  <iframe
    src="${embedUrl}"
    width="100%"
    height="80"
    frameborder="0"
    scrolling="no"
    style="border-radius:12px; border:none;"
    title="Markee: ${name}"
  ></iframe>
</div>`

  const fullModalPrompt = `I want to add a full Markee buy-flow modal to my Next.js site -- not just a display widget, but an embedded modal where visitors can buy or boost a message without leaving my site.

My leaderboard:
- Name: ${name}
- Address: ${address}
- Buy page (fallback for non-Next.js sites): ${buyUrl}

## What to build

Two components:

1. A trigger component (e.g. MarkeeSign) that:
   - Fetches and displays the current top message from /api/markee/leaderboards (see proxy route below)
   - Shows the owner name below the message (truncate 0x addresses to 0x1234...abcd, show plain names as-is)
   - On hover reveals a price badge: "X.XXX ETH to change" or "be first!" if no messages yet
   - Opens the modal when clicked
   - Is disabled only while loading (never on fetch error -- fall back to default message and let the modal open)
   - Wraps its container with ${dataAttr} for integration verification
   - After a successful transaction, waits 3 seconds then re-fetches to show the new message

2. A modal component (e.g. MarkeeModal) that is a full buy flow with:
   - A header with the site logo, title, and close button
   - The current top message displayed above the tabs
   - Two tabs: "Buy a Message" and "Boost Existing Message"
   - A footer: "You'll receive MARKEE tokens with your purchase and co-own the Markee Network." (link "Markee Network" to the Gardens community for this leaderboard if applicable)

### Buy a Message tab
- Textarea for the message (left-aligned, monospace, char counter, maxLength from contract)
- Optional name input
- ETH amount section:
  - "Take top spot" preset button (shows only when there is an existing top message)
  - "Minimum" preset button
  - Custom number input, capped at 8 total digit characters (before + after decimal)
  - Clickable balance label that fills the field with the user's full balance, floored to fit within the 8-digit cap and never exceeding actual balance
  - Inline "Amount exceeds your balance" warning below the input (not just on submit)
- Wrong network banner with "Switch to Base" button (always visible when connected to wrong chain)
- Low balance banner when connected balance is below the minimum price
- Connect Wallet button (closes dialog before opening RainbowKit modal so it appears on top; dialog reopens when the connect modal closes)
- Buy Message submit button (disabled when loading, insufficient balance, or low balance)

### Boost Existing Message tab
- List of top messages read directly from the contract via getTopMarkees(10) + useReadContracts for message/name per address -- do NOT use the API for this, the API only returns the top 1
- Each entry shows: message, owner name, ETH funded, #1 badge for top entry
- Clicking an entry selects it (highlighted border)
- When an entry is selected and it already holds the top spot, show a note: "This message has the top spot. Add more funds to make it harder to reach."
- "Edit messages you own on the Markee app." link (or "See more messages and edit messages you own." if > 5 entries) shown ABOVE the payment section, linking to ${buyUrl}
- Amount to Pay section (no Minimum button, only Take Top Spot + custom input)
  - Take top spot amount for the selected entry = topFundsAdded - selectedEntryFunds + 0.001 ETH
  - If the selected entry IS already the top, show Take Top Spot button with selectedFunds + 0.001 ETH
- "Add Funds to this Message" submit button

### Success state
When a transaction confirms, replace the entire modal body (below the header) with:
- A large checkmark
- "Transaction confirmed!"
- "View on Basescan" link to https://basescan.org/tx/{hash}
- "Refreshing in a moment..." note
The modal stays open indefinitely. When the user closes it after success, trigger the data refresh.

## Contract interactions

All on Base (chainId 8453).

Leaderboard contract: ${address}

ABI functions needed:
- minimumPrice() view -> uint256
- maxMessageLength() view -> uint256
- getTopMarkees(limit: uint256) view -> (address[], uint256[]) -- top markee addresses + their funds
- createMarkee(message: string, name: string) payable -> address  -- buys a new message
- addFunds(markeeAddress: address) payable  -- boosts an existing message

Per-markee ABI (call on each markee contract address returned by getTopMarkees):
- message() view -> string
- name() view -> string

## Data fetching

### Proxy route (required -- avoids CORS)
Create app/api/markee/leaderboards/route.ts:
  export async function GET() {
    const res = await fetch('${apiUrl}', { next: { revalidate: 60 } })
    if (!res.ok) return Response.json({ leaderboards: [] }, { status: res.status })
    return Response.json(await res.json())
  }

Then fetch /api/markee/leaderboards in the trigger component.
Find the entry where address matches "${address}" (case-insensitive).
Fields: topMessage, topMessageOwner, topFundsAddedRaw, minimumPrice

### On-chain reads
Use wagmi useReadContract / useReadContracts for:
- minimumPrice, maxMessageLength (in both components or passed as props)
- getTopMarkees(10n) -- in the boost tab only (enable query only when on that tab)
- Per-markee message + name via useReadContracts multicall on the returned addresses

### Network detection
Use useAccount().chainId (not useChainId()) -- it is bound to the connected account and stays accurate in multi-wallet-extension environments.
const { address, isConnected, chainId } = useAccount()
const isOnBase = isConnected && chainId === base.id

### Wallet connect and dialog z-index
The modal should use the native <dialog> element with showModal(). When opening the RainbowKit connect modal, close the dialog first so it appears on top, then reopen it when the connect modal closes:
  dialogRef.current?.close()
  openConnectModal?.()
  // useEffect: if (!connectModalOpen && !dialogRef.current?.open) dialogRef.current?.showModal()

## Packages required
- wagmi v2
- viem v2
- @rainbow-me/rainbowkit v2
- @tanstack/react-query v5

Wrap the app in (order matters):
WagmiProvider -> QueryClientProvider -> RainbowKitProvider

wagmi config: getDefaultConfig({ appName, projectId, chains: [base], ssr: true })
Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your environment (get a free ID at cloud.walletconnect.com).

## Implementation notes
- The data-markee-address attribute must be in the server-rendered HTML for verification. In Next.js, placing it in JSX inside a 'use client' component is fine -- Next.js SSRs client components. Avoid setting it only via useEffect or document.setAttribute().
- takeTopSpot passed to the modal = topFundsAdded + 0.001 ETH (MIN_INCREMENT). If no competition yet, use minimumPrice.
- On fetch error from the proxy route, fall back to the default message and still allow the modal to open -- the modal works fully from on-chain data alone.
- Style to match your site's existing design system. The pattern works with any CSS framework.

Please look at this codebase and implement both components. Choose an appropriate location for the trigger (sidebar widget, footer, header banner). Match the existing code style.`

  if (!isOpen) return null

  const isVerified = leaderboard.status === 'verified' || (leaderboard.verifiedUrls?.length ?? 0) > 0

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'modal', label: 'Full Modal', icon: <Sparkles size={13} /> },
    { id: 'prompt', label: 'Simple Widget', icon: <Globe2 size={13} /> },
    { id: 'snippet', label: 'Code', icon: <Code2 size={13} /> },
    { id: 'iframe', label: 'iFrame', icon: <Monitor size={13} /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-7 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0">
            <Globe2 size={17} className="text-[#F897FE]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[#EDEEFF] font-bold text-base">Integration Guide</h2>
            <p className="text-[#8A8FBF] text-xs truncate">{name}</p>
          </div>
          {isVerified ? (
            <span className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[#1DB227] bg-[#1DB227]/10 border border-[#1DB227]/30 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={11} />
              Verified
            </span>
          ) : onOpenVerify && (
            <button
              onClick={onOpenVerify}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[#8A8FBF] border border-[#8A8FBF]/30 hover:border-[#F897FE]/50 hover:text-[#F897FE] px-2.5 py-1 rounded-full transition-colors"
            >
              <CheckCircle2 size={11} />
              Verify
            </button>
          )}
        </div>

        {/* Platform / moderation banner */}
        {verifiedUrl && platform !== null && (
          <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-4 flex-shrink-0 ${
            platform === 'unknown'
              ? 'bg-[#FFD700]/8 border border-[#FFD700]/20 text-[#FFD700]'
              : moderationStatus === 'error'
                ? 'bg-[#7C9CFF]/8 border border-[#7C9CFF]/20 text-[#7C9CFF]'
                : 'bg-[#1DB227]/8 border border-[#1DB227]/20 text-[#1DB227]'
          }`}>
            {platform === 'unknown'
              ? <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              : <Info size={13} className="flex-shrink-0 mt-0.5" />
            }
            <span>
              {platform === 'unknown'
                ? 'Site does not appear to be on Vercel. Moderation uses @vercel/kv — swap for any Redis client if deploying elsewhere.'
                : moderationStatus === 'error'
                  ? 'Vercel detected. Add KV_REST_API_URL and KV_REST_API_TOKEN in your Vercel project settings to enable moderation.'
                  : 'Vercel detected. Moderation is active.'
              }
            </span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 bg-[#060A2A] rounded-lg p-1 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex-1 justify-center ${
                tab === t.id
                  ? 'bg-[#0A0F3D] text-[#EDEEFF] shadow'
                  : 'text-[#8A8FBF] hover:text-[#EDEEFF]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1 space-y-4 min-h-0">

          {tab === 'modal' && (
            <>
              <p className="text-[#8A8FBF] text-xs">
                The recommended integration for Next.js sites. Visitors buy or boost a message without leaving your site. Paste this prompt into Claude, ChatGPT, or Cursor alongside your codebase.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {['wagmi v2', 'viem v2', 'RainbowKit v2', 'TanStack Query v5'].map(pkg => (
                  <span key={pkg} className="bg-[#060A2A] border border-[#8A8FBF]/20 px-2 py-0.5 rounded font-mono text-[#F897FE]">{pkg}</span>
                ))}
              </div>
              <CodeBlock code={fullModalPrompt} />
            </>
          )}

          {tab === 'prompt' && (
            <>
              <p className="text-[#8A8FBF] text-xs">
                A lightweight display widget with a link to buy on markee.xyz. For a full on-site buy flow, use the Full Modal tab. Paste into Claude, ChatGPT, or Cursor alongside your codebase.
              </p>
              <CodeBlock code={aiPrompt} />
            </>
          )}

          {tab === 'snippet' && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => setSnippetLang('react')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    snippetLang === 'react'
                      ? 'bg-[#F897FE] text-[#060A2A]'
                      : 'text-[#8A8FBF] hover:text-[#EDEEFF]'
                  }`}
                >
                  React / Next.js
                </button>
                <button
                  onClick={() => setSnippetLang('vanilla')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    snippetLang === 'vanilla'
                      ? 'bg-[#F897FE] text-[#060A2A]'
                      : 'text-[#8A8FBF] hover:text-[#EDEEFF]'
                  }`}
                >
                  Vanilla JS
                </button>
              </div>

              {snippetLang === 'react' ? (
                <>
                  <p className="text-[#8A8FBF] text-xs">
                    The <code className="bg-[#060A2A] px-1 rounded">data-markee-address</code> attribute is required for verification. In Next.js, placing it in JSX is fine even inside a <code className="bg-[#060A2A] px-1 rounded">&apos;use client&apos;</code> component -- Next.js SSRs client components into the initial HTML. Avoid setting it only via <code className="bg-[#060A2A] px-1 rounded">useEffect</code> or <code className="bg-[#060A2A] px-1 rounded">document.setAttribute()</code>.
                  </p>
                  <CodeBlock code={reactSnippet} />
                </>
              ) : (
                <CodeBlock code={vanillaSnippet} />
              )}
            </>
          )}

          {tab === 'iframe' && (
            <>
              <p className="text-[#8A8FBF] text-xs">
                Drop-in embed. No JavaScript required. The widget fetches the current message server-side and refreshes automatically.
              </p>
              <CodeBlock code={iframeSnippet} />
              <div>
                <p className="text-[#8A8FBF] text-xs mb-2">Live preview:</p>
                <div className="rounded-lg overflow-hidden border border-[#8A8FBF]/20">
                  <iframe
                    src={embedUrl}
                    width="100%"
                    height="80"
                    style={{ border: 'none', display: 'block' }}
                    title="Markee widget preview"
                  />
                </div>
              </div>
            </>
          )}

        </div>

        {onOpenVerify && !isVerified && (
          <div className="mt-4 pt-4 border-t border-[#8A8FBF]/15 flex-shrink-0">
            <button
              onClick={onOpenVerify}
              className="w-full flex items-center justify-center gap-2 border border-[#8A8FBF]/30 hover:border-[#F897FE]/50 text-[#8A8FBF] hover:text-[#F897FE] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <CheckCircle2 size={14} />
              Verify Integration
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
