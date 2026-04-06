'use client'

import { useState } from 'react'
import { X, Copy, Check, Code2, Globe2, Monitor, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react'

type Tab = 'prompt' | 'snippet' | 'iframe' | 'verify'

interface IntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  leaderboard: {
    address: string
    name: string
    verifiedUrl?: string | null
    status?: 'pending' | 'verified'
  }
  onVerified?: () => void
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

export function IntegrationModal({ isOpen, onClose, leaderboard, onVerified }: IntegrationModalProps) {
  const [tab, setTab] = useState<Tab>('prompt')
  const [snippetLang, setSnippetLang] = useState<'react' | 'vanilla'>('react')
  const [verifyUrl, setVerifyUrl] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifySuccess, setVerifySuccess] = useState(false)

  const { address, name } = leaderboard
  const lowerAddress = address.toLowerCase()
  const buyUrl = `https://markee.xyz/ecosystem/website/${address}`
  const embedUrl = `https://markee.xyz/api/embed/${address}`
  const apiUrl = `https://markee.xyz/api/openinternet/leaderboards`
  const metaTag = `<meta name="markee-address" content="${lowerAddress}">`

  const aiPrompt = `I want to add a Markee widget to my website.

Markee is a protocol where anyone can pay ETH to set the message displayed on my site. The highest bidder's message is always shown — anyone can outbid the current holder.

My leaderboard:
- Name: ${name}
- Address: ${address}
- Buy page (where visitors go to bid): ${buyUrl}

Step 1 — Add this to your <head> for verification:
${metaTag}

Step 2 — Fetch the current top message:
GET ${apiUrl}
Find the entry where address matches "${address}" (case-insensitive).
Relevant fields: topMessage, topMessageOwner, minimumPrice, totalFunds

Step 3 — Display it on my site:
- Show topMessage prominently
- Link "Change this message" to ${buyUrl}
- Re-fetch every 60 seconds to stay current
- Optionally show topMessageOwner (a wallet address) and current minimum bid price

Please look at this codebase and implement the integration. Choose an appropriate location (footer, header banner, sidebar widget). Match the existing code style. Keep it minimal.`

  const reactSnippet = `// components/MarkeeWidget.tsx
'use client'

import { useState, useEffect } from 'react'

const LEADERBOARD_ADDRESS = '${address}'
const BUY_URL = '${buyUrl}'

export function MarkeeWidget() {
  const [message, setMessage] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)

  async function fetchMessage() {
    try {
      const res = await fetch('${apiUrl}')
      const json = await res.json()
      const lb = json.leaderboards?.find(
        (l: any) => l.address.toLowerCase() === LEADERBOARD_ADDRESS.toLowerCase()
      )
      if (lb) {
        setMessage(lb.topMessage)
        setOwner(lb.topMessageOwner)
      }
    } catch {}
  }

  useEffect(() => {
    fetchMessage()
    const interval = setInterval(fetchMessage, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!message) return null

  return (
    <div className="markee-widget">
      <p>{message}</p>
      {owner && (
        <p className="markee-owner">
          — {owner.slice(0, 6)}…{owner.slice(-4)}
        </p>
      )}
      <a href={BUY_URL} target="_blank" rel="noopener noreferrer">
        Change this message
      </a>
    </div>
  )
}`

  const vanillaSnippet = `<!-- 1. Add to your <head> for verification -->
${metaTag}

<!-- 2. Add where you want the widget -->
<div id="markee-widget"></div>

<!-- 3. Add before </body> -->
<script>
  (function () {
    var ADDRESS = '${address}';
    var BUY_URL = '${buyUrl}';

    function fetchMessage() {
      fetch('${apiUrl}')
        .then(function (r) { return r.json(); })
        .then(function (json) {
          var lb = (json.leaderboards || []).find(function (l) {
            return l.address.toLowerCase() === ADDRESS.toLowerCase();
          });
          if (!lb || !lb.topMessage) return;
          var owner = lb.topMessageOwner
            ? lb.topMessageOwner.slice(0, 6) + '…' + lb.topMessageOwner.slice(-4)
            : '';
          var el = document.getElementById('markee-widget');
          if (!el) return;
          el.innerHTML =
            '<p>' + lb.topMessage + '</p>' +
            (owner ? '<p>— ' + owner + '</p>' : '') +
            '<a href="' + BUY_URL + '" target="_blank">Change this message</a>';
        });
    }

    fetchMessage();
    setInterval(fetchMessage, 60000);
  })();
<\/script>`

  const iframeSnippet = `<!-- Add to your <head> for verification -->
${metaTag}

<!-- Paste where you want the widget to appear -->
<iframe
  src="${embedUrl}"
  width="100%"
  height="80"
  frameborder="0"
  scrolling="no"
  style="border-radius:12px; border:none;"
  title="Markee — ${name}"
></iframe>`

  async function handleVerify() {
    if (!verifyUrl.trim()) return
    setVerifyError(null)
    setVerifying(true)
    try {
      const res = await fetch('/api/openinternet/verify-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, url: verifyUrl.trim() }),
      })
      const data = await res.json()
      if (data.verified) {
        setVerifySuccess(true)
        onVerified?.()
      } else {
        setVerifyError(data.error ?? 'Verification failed')
      }
    } catch {
      setVerifyError('Something went wrong — please try again')
    } finally {
      setVerifying(false)
    }
  }

  if (!isOpen) return null

  const isVerified = leaderboard.status === 'verified' || verifySuccess

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'prompt', label: 'AI Prompt', icon: <Globe2 size={13} /> },
    { id: 'snippet', label: 'Code', icon: <Code2 size={13} /> },
    { id: 'iframe', label: 'iFrame', icon: <Monitor size={13} /> },
    { id: 'verify', label: 'Verify', icon: <CheckCircle2 size={13} /> },
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
          {isVerified && (
            <span className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[#1DB227] bg-[#1DB227]/10 border border-[#1DB227]/30 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={11} />
              Verified
            </span>
          )}
        </div>

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

          {tab === 'prompt' && (
            <>
              <p className="text-[#8A8FBF] text-xs">
                Copy this prompt and paste it into Claude, ChatGPT, or Cursor alongside your codebase. It will recommend and implement the right integration for your stack.
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
                  <div>
                    <p className="text-[#8A8FBF] text-xs mb-2">
                      Add to your <code className="bg-[#060A2A] px-1 rounded">&lt;head&gt;</code> for verification:
                    </p>
                    <CodeBlock code={metaTag} />
                  </div>
                  <div>
                    <p className="text-[#8A8FBF] text-xs mb-2">React component:</p>
                    <CodeBlock code={reactSnippet} />
                  </div>
                </>
              ) : (
                <CodeBlock code={vanillaSnippet} />
              )}
            </>
          )}

          {tab === 'iframe' && (
            <>
              <p className="text-[#8A8FBF] text-xs">
                Drop-in embed — no JavaScript required. The widget fetches the current message server-side and refreshes automatically.
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

          {tab === 'verify' && (
            <>
              <p className="text-[#8A8FBF] text-xs">
                Once you've deployed the meta tag, verify ownership to unlock your listing in the{' '}
                <span className="text-[#EDEEFF]">Top Verified Markees</span> section on the ecosystem page.
              </p>

              <div>
                <p className="text-[#8A8FBF] text-xs mb-2">
                  Add this to your <code className="bg-[#060A2A] px-1 rounded">&lt;head&gt;</code>:
                </p>
                <CodeBlock code={metaTag} />
              </div>

              {isVerified ? (
                <div className="flex items-center gap-3 bg-[#1DB227]/10 border border-[#1DB227]/30 rounded-lg px-4 py-3">
                  <CheckCircle2 size={18} className="text-[#1DB227] flex-shrink-0" />
                  <div>
                    <p className="text-[#1DB227] text-sm font-semibold">Integration verified</p>
                    {(leaderboard.verifiedUrl) && (
                      <a
                        href={leaderboard.verifiedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[#8A8FBF] text-xs hover:text-[#F897FE] transition-colors mt-0.5"
                      >
                        {leaderboard.verifiedUrl}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                      Your site URL
                    </label>
                    <input
                      type="url"
                      value={verifyUrl}
                      onChange={e => { setVerifyUrl(e.target.value); setVerifyError(null) }}
                      placeholder="https://yoursite.com"
                      className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
                      disabled={verifying}
                    />
                  </div>

                  {verifyError && (
                    <div className="flex items-start gap-2 text-red-400 text-sm">
                      <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                      <span>{verifyError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleVerify}
                    disabled={verifying || !verifyUrl.trim()}
                    className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {verifying ? (
                      <><Loader2 size={15} className="animate-spin" /> Checking…</>
                    ) : (
                      'Verify Integration'
                    )}
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
