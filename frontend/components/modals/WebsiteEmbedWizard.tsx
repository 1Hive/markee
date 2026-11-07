'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { CopyButton } from '@/components/board-detail/shared'
import { TxSteps, TxRing } from '@/components/modals/StreamUI'
import {
  buildEmbedPrompt,
  embedModerationPolicy,
  moderationOptionSource,
  type EmbedStrategy,
} from '@/lib/embedPrompt/fragments'
import type { ModerationRuleSet } from '@/lib/moderation/severity'
import { alreadyVerifiedNote, useVerifiedSiteUrls, verifiedOnSameDomain } from '@/lib/integrations/verifiedSites'
import { MONO, BG, PINK, TEXT, TEXT2, MUTED, BORDER, DANGER } from '@/lib/design-tokens'

// Only claim the public-page verification that the server actually performs.
const CHECK_STEPS = [{ label: 'Verify Markee on your site', caption: 'VERIFYING YOUR SITE…' }]
const STEP_MIN_MS = 700

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const primaryBtnStyle = (enabled: boolean): React.CSSProperties => ({
  background: enabled ? PINK : 'transparent',
  color: enabled ? BG : MUTED,
  border: enabled ? 'none' : `1px solid ${BORDER}`,
  borderRadius: 8, padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
  cursor: enabled ? 'pointer' : 'not-allowed', width: '100%',
  opacity: enabled ? 1 : 0.6, transition: 'opacity 140ms',
})

// The optional auto-moderation rules, in display order. Scams & phishing are always checked.
const MODERATION_ROWS: { key: keyof ModerationRuleSet; label: string }[] = [
  { key: 'profanity', label: 'Profanity' },
  { key: 'links', label: 'All URLs' },
  { key: 'addresses', label: 'Contract addresses' },
  { key: 'ens', label: 'ENS names' },
]
// Standard: profanity on, content restrictions off.
const DEFAULT_RULES: ModerationRuleSet = { profanity: true, links: false, addresses: false, ens: false }

const PANEL_BG = '#030714'
const ACTIVE_BG = 'rgba(248,151,254,0.14)'
const ACTIVE_BORDER = 'rgba(248,151,254,0.5)'

const sectionLabel: React.CSSProperties = {
  fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase',
}

// ── Segmented control (integration tabs) ─────────────────────────────────────
function Segmented<T extends string>({ options, value, onChange, role, label }: {
  options: { value: T; label: React.ReactNode }[]
  value: T
  onChange: (value: T) => void
  role: 'tablist' | 'radiogroup'
  label: string
}) {
  return (
    <div
      role={role}
      aria-label={label}
      style={{ display: 'flex', gap: 4, padding: 4, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10 }}
    >
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role={role === 'tablist' ? 'tab' : 'radio'}
            aria-selected={role === 'tablist' ? active : undefined}
            aria-checked={role === 'radiogroup' ? active : undefined}
            onClick={() => onChange(option.value)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
              background: active ? ACTIVE_BG : 'transparent',
              border: `1px solid ${active ? ACTIVE_BORDER : 'transparent'}`,
              color: active ? PINK : TEXT2,
              transition: 'background 140ms, color 140ms, border-color 140ms',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────
interface WebsiteEmbedWizardProps {
  address: string
  name?: string
  strategy: EmbedStrategy
  onHeaderChange?: (header: { label: string; showBack: boolean }) => void
  onDone?: () => void
}

type Step = 'setup' | 'verifying' | 'verified'

export function WebsiteEmbedWizard({ address, name, strategy, onHeaderChange, onDone }: WebsiteEmbedWizardProps) {
  const [step, setStep] = useState<Step>('setup')
  const [rules, setRules] = useState<ModerationRuleSet>(DEFAULT_RULES)
  const [integration, setIntegration] = useState<'ai' | 'sdk'>('ai')
  const [codeFormat, setCodeFormat] = useState<'react' | 'vanilla'>('react')
  const [showModerationInfo, setShowModerationInfo] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [promptCopyFailed, setPromptCopyFailed] = useState(false)
  const promptFallbackRef = useRef<HTMLTextAreaElement>(null)
  // A copy result belongs to the prompt it copied: changing the rules or tab starts over.
  useEffect(() => { setPromptCopied(false); setPromptCopyFailed(false) }, [rules, integration])
  const [siteUrl, setSiteUrl] = useState('')
  const verifiedSiteUrls = useVerifiedSiteUrls(address)
  const [verifyStepIdx, setVerifyStepIdx] = useState(0)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    if (step === 'setup') onHeaderChange?.({ label: 'Add Markee To Your Site', showBack: true })
    else if (step === 'verifying') onHeaderChange?.({ label: 'Verifying Your Site', showBack: false })
    else onHeaderChange?.({ label: 'Markee Added!', showBack: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function runVerification() {
    const id = ++runId.current
    setVerifyError(null)
    setVerifyStepIdx(0)
    const bail = (msg: string) => { if (runId.current === id) setVerifyError(msg) }

    // Step 0: Detect Markee — the one hard requirement (data-markee-address must be server-rendered).
    let detectOk = false
    try {
      const [res] = await Promise.all([
        fetch('/api/openinternet/verify-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, url: siteUrl }),
        }).then(r => r.json()).catch(() => ({ verified: false, error: 'Network error' })),
        wait(STEP_MIN_MS),
      ])
      detectOk = !!res.verified
      if (!detectOk) {
        const reachIssue = /reach|HTTP \d|network/i.test(res.error || '')
        bail(reachIssue
          ? 'Make sure the URL is correct and the site is publicly accessible, then try again.'
          : 'Make sure the data-markee-address attribute is present in your page’s server-rendered HTML, then try again.')
        return
      }
    } catch {
      bail('Make sure the URL is correct and the site is publicly accessible, then try again.')
      return
    }
    if (runId.current !== id) return
    setStep('verified')
  }

  function handleVerifyClick() {
    if (!siteUrl.trim()) return
    setStep('verifying')
    runVerification()
  }

  function handleRetry() {
    runId.current++
    setVerifyError(null)
    setStep('setup')
  }

  // ── Verifying / Verified ──────────────────────────────────────────────────
  if (step === 'verifying' || step === 'verified') {
    const doneCount = step === 'verified' ? CHECK_STEPS.length : verifyStepIdx
    const steps = CHECK_STEPS.map((s, i) => ({
      label: s.label,
      done: i < doneCount,
      active: i === doneCount && !verifyError,
    }))
    return (
      <div style={{ padding: '10px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
        <TxSteps steps={steps} />
        <TxRing done={step === 'verified'} spinning={step === 'verifying' && !verifyError} />
        {step === 'verified' ? (
          <div style={{ color: TEXT, fontWeight: 700, fontSize: 17 }}>Markee is live on your site!</div>
        ) : verifyError ? (
          <div>
            <p style={{ margin: 0, fontSize: 13, color: '#FF8E8E' }}>{verifyError}</p>
            <button
              onClick={handleRetry}
              style={{
                marginTop: 10, background: 'transparent', border: 'none', color: PINK,
                fontFamily: MONO, fontSize: 12.5, cursor: 'pointer', padding: 0,
              }}
            >
              ← Try again
            </button>
          </div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 13, color: PINK, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {CHECK_STEPS[verifyStepIdx].caption}
          </div>
        )}
        {step === 'verified' && (
          <button onClick={() => onDone?.()} style={{ ...primaryBtnStyle(true), marginTop: 4 }}>
            Done
          </button>
        )}
      </div>
    )
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  const policy = embedModerationPolicy({ rules })
  const moderationSource = moderationOptionSource(policy)
  const prompt = buildEmbedPrompt({ address, name, strategy, rules })
  const marker = `<span hidden data-markee-address="${address}"></span>`
  const shortAddress = `${address.slice(0, 6)}…${address.slice(-5)}`
  const playgroundUrl = `https://markee-sdk-connectkit-example.vercel.app/?${new URLSearchParams({ integration: codeFormat, board: address, ...(policy.startsWith('custom:') ? { rules: (Object.keys(rules) as (keyof ModerationRuleSet)[]).filter(k => rules[k]).join(',') } : { severity: policy }), strategy: strategy === 'streaming' ? 'ForRent' : 'ForSale' })}#sdk-configuration`
  const reactCode = `'use client';
import { MarkeeSign } from '@markee_team/sdk/react';

export default function SiteMarkee() {
  return <MarkeeSign
    placement={{ kind: 'board', chainId: 8453, address: '${address}' }}
    moderation={${moderationSource}}
    theme={{ mode: 'system' }}
    siteUrl="https://your-site.com"
  />;
}`
  const vanillaCode = `// HTML: <div id="markee"></div>
import { createMarkeeSign } from '@markee_team/sdk';

const sign = createMarkeeSign(document.querySelector('#markee'), {
  placement: { kind: 'board', chainId: 8453, address: '${address}' },
  moderation: ${moderationSource},
  theme: { mode: 'system' },
  siteUrl: 'https://your-site.com',
});

// On page teardown:
// sign.destroy();`
  const code = codeFormat === 'react' ? reactCode : vanillaCode

  // The AI tab doesn't display the prompt, so if the clipboard is unavailable (denied permission,
  // non-HTTPS, sandboxed iframe) show it in a read-only box the user can select and copy by hand.
  const copyPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(prompt)
      setPromptCopyFailed(false)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 1800)
    } catch {
      setPromptCopied(false)
      setPromptCopyFailed(true)
      requestAnimationFrame(() => promptFallbackRef.current?.select())
    }
  }

  const panel: React.CSSProperties = { background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 10 }
  const linkStyle: React.CSSProperties = { color: PINK, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }
  const hasUrl = !!siteUrl.trim()

  const moderation = (
    <div style={{ marginTop: 24 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span id="embed-moderation-label" style={sectionLabel}>Auto-moderation</span>
        <button
          type="button"
          aria-label="About auto-moderation"
          aria-expanded={showModerationInfo}
          aria-controls="embed-moderation-info"
          onClick={() => setShowModerationInfo(v => !v)}
          onMouseEnter={() => setShowModerationInfo(true)}
          onMouseLeave={() => setShowModerationInfo(false)}
          onFocus={() => setShowModerationInfo(true)}
          onBlur={() => setShowModerationInfo(false)}
          style={{
            width: 22, height: 22, borderRadius: 99, border: `1.5px solid ${showModerationInfo ? PINK : MUTED}`,
            background: 'transparent', color: showModerationInfo ? PINK : MUTED, cursor: 'pointer',
            fontFamily: 'Georgia, serif', fontSize: 12, lineHeight: 1, padding: 0,
          }}
        >
          i
        </button>
        {showModerationInfo && (
          <p id="embed-moderation-info" role="tooltip" style={{
            position: 'absolute', top: 28, right: 0, zIndex: 2, width: 'min(300px, 100%)', margin: 0, padding: '10px 12px',
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            color: TEXT2, fontSize: 12.5, lineHeight: 1.55,
          }}>
            Auto-moderation runs after a message is bought. Blocked messages are flagged automatically. Moderators can manually unflag messages, or buyers can edit their messages to get unflagged.
          </p>
        )}
      </div>
      <div role="group" aria-labelledby="embed-moderation-label" style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'rgba(138,143,191,0.10)' }}>
          <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>Scams &amp; phishing</span>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.2, color: PINK }}>ALWAYS BLOCKED</span>
        </div>
        {MODERATION_ROWS.map(row => {
          const blocked = rules[row.key]
          return (
            <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', borderTop: `1px solid ${BORDER}` }}>
              <span id={`embed-moderation-${row.key}`} style={{ color: blocked ? TEXT : TEXT2, fontSize: 14, fontWeight: blocked ? 700 : 500 }}>{row.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.2, color: blocked ? PINK : MUTED }}>{blocked ? 'BLOCKED' : 'ALLOWED'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={blocked}
                  aria-labelledby={`embed-moderation-${row.key}`}
                  onClick={() => setRules(r => ({ ...r, [row.key]: !r[row.key] }))}
                  style={{
                    position: 'relative', width: 40, height: 22, borderRadius: 99, padding: 0, cursor: 'pointer', flexShrink: 0,
                    background: blocked ? PINK : 'rgba(138,143,191,0.25)', border: `1px solid ${blocked ? PINK : 'rgba(138,143,191,0.45)'}`,
                    transition: 'background 140ms, border-color 140ms',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: blocked ? 20 : 2, width: 16, height: 16, borderRadius: 99,
                    background: blocked ? BG : MUTED, transition: 'left 140ms',
                  }} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
      <Segmented
        role="tablist"
        label="Integration method"
        value={integration}
        onChange={setIntegration}
        options={[
          { value: 'ai', label: '✦ Use AI' },
          { value: 'sdk', label: '</> Install SDK' },
        ]}
      />

      {integration === 'ai' ? (
        <div role="tabpanel" style={{ marginTop: 22 }}>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {['Paste the prompt into your coding assistant', 'Confirm placement, let it build & test', 'Deploy, then verify your page below'].map((text, i) => (
              <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, color: TEXT, fontSize: 14.5 }}>
                <span aria-hidden="true" style={{
                  width: 26, height: 26, borderRadius: 99, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${i === 0 ? PINK : 'rgba(138,143,191,0.45)'}`,
                  color: i === 0 ? PINK : TEXT2, fontSize: 12, fontWeight: 700,
                }}>
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
          <p style={{ margin: '12px 0 0 38px', color: MUTED, fontSize: 12.5 }}>Works with Claude Code, Cursor, ChatGPT…</p>
          {moderation}
          <button
            type="button"
            onClick={copyPrompt}
            style={{ ...primaryBtnStyle(true), marginTop: 22, padding: '14px 22px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {promptCopied ? <Check size={16} /> : <Copy size={16} />}
            {promptCopied ? 'Copied!' : 'Copy Prompt'}
          </button>
          {promptCopyFailed && (
            <div style={{ marginTop: 14 }}>
              <p role="alert" style={{ margin: '0 0 8px', color: DANGER, fontSize: 13 }}>
                Couldn&apos;t copy to your clipboard. Select the prompt below and copy it manually.
              </p>
              <textarea
                ref={promptFallbackRef}
                readOnly
                value={prompt}
                aria-label="Embed prompt"
                onFocus={e => { const box = e.currentTarget; box.select(); box.setSelectionRange(0, box.value.length) }}
                rows={8}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px',
                  background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT,
                  fontFamily: MONO, fontSize: 12, lineHeight: 1.5,
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" style={{ marginTop: 22 }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>1 · Install</div>
          <div style={{ ...panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px 10px 16px' }}>
            <code style={{ fontFamily: MONO, fontSize: 13.5, color: TEXT, overflowWrap: 'anywhere' }}>
              <span style={{ color: PINK }}>$</span> npm i @markee_team/sdk
            </code>
            <CopyButton text="npm i @markee_team/sdk" />
          </div>

          <div style={{ ...sectionLabel, margin: '20px 0 10px' }}>2 · Your Markee address</div>
          <div style={{ ...panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px 10px 16px' }}>
            <code title={address} style={{ fontFamily: MONO, fontSize: 13.5, color: TEXT }}>{shortAddress}</code>
            <CopyButton text={address} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '20px 0 10px' }}>
            <span style={sectionLabel}>3 · Add to your app</span>
            <div role="radiogroup" aria-label="Code format" style={{ display: 'flex', gap: 4 }}>
              {(['react', 'vanilla'] as const).map(format => {
                const active = codeFormat === format
                return (
                  <button
                    key={format}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCodeFormat(format)}
                    style={{
                      fontFamily: MONO, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                      border: 'none', cursor: 'pointer',
                      background: active ? ACTIVE_BG : 'transparent', color: active ? PINK : TEXT2,
                    }}
                  >
                    {format === 'react' ? 'React' : 'Vanilla JS'}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ ...panel, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, right: 12 }}><CopyButton text={code} /></div>
            <pre style={{
              margin: 0, padding: '14px 16px', maxHeight: 220, overflow: 'auto',
              fontFamily: MONO, fontSize: 12.5, color: TEXT2, lineHeight: 1.65, whiteSpace: 'pre',
            }}>
              {code}
            </pre>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, color: MUTED, fontSize: 12 }}>
            <span>Client-rendered app (e.g. Vite)? Add the verification marker to your server HTML.</span>
            <CopyButton text={marker} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 12 }}>
            <a href="https://www.npmjs.com/package/@markee_team/sdk" target="_blank" rel="noopener noreferrer" style={linkStyle}>Full docs on npm ↗</a>
            <a href={playgroundUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>Customize in playground ↗</a>
          </div>
          {moderation}
        </div>
      )}

      {/* ── Deployed? Verify ── */}
      <div style={{ margin: '26px -22px 0', padding: '22px 22px 0', borderTop: `1px solid ${BORDER}` }}>
        <label htmlFor="embed-verify-url" style={{ ...sectionLabel, display: 'block', marginBottom: 12 }}>Deployed? Verify</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            id="embed-verify-url"
            type="url"
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleVerifyClick() }}
            placeholder="https://yoursite.com/page"
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box', background: BG, color: TEXT,
              border: `1px solid ${BORDER}`, borderRadius: 8, padding: '11px 14px',
              fontFamily: MONO, fontSize: 13, outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleVerifyClick}
            disabled={!hasUrl}
            style={{
              flexShrink: 0, borderRadius: 8, padding: '0 20px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
              cursor: hasUrl ? 'pointer' : 'not-allowed', opacity: hasUrl ? 1 : 0.6,
              // Outline on the AI tab, where Copy Prompt is the primary action; filled on the SDK tab.
              background: integration === 'sdk' ? PINK : 'transparent',
              color: integration === 'sdk' ? BG : PINK,
              border: `1.5px solid ${PINK}`,
            }}
          >
            Verify
          </button>
        </div>
        {verifiedOnSameDomain(siteUrl, verifiedSiteUrls) && (
          <p role="status" style={{ margin: '10px 0 0', color: TEXT2, fontSize: 12.5, lineHeight: 1.5 }}>
            {alreadyVerifiedNote(siteUrl)} You can still verify to check this page shows your Markee.
          </p>
        )}
      </div>
    </>
  )
}
