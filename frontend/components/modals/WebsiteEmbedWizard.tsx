'use client'

import { useEffect, useRef, useState } from 'react'
import { CopyButton } from '@/components/board-detail/shared'
import { TxSteps, TxRing } from '@/components/modals/StreamUI'
import {
  buildEmbedPrompt,
  type EmbedFramework, type EmbedWallet, type EmbedAgent, type EmbedStrategy,
} from '@/lib/embedPrompt/fragments'

// ── Design tokens (mirrors the modal shell this renders inside) ────────────────
const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BG     = '#060A2A'
const PINK   = '#F897FE'
const TEXT   = '#EDEEFF'
const TEXT2  = '#B8B6D9'
const MUTED  = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'

const FRAMEWORKS: { key: EmbedFramework; label: string }[] = [
  { key: 'nextjs', label: 'Next.js' },
  { key: 'react', label: 'React' },
  { key: 'vue', label: 'Vue' },
  { key: 'html', label: 'Plain HTML' },
]

const WALLETS: { key: EmbedWallet; label: string }[] = [
  { key: 'privy', label: 'Privy' },
  { key: 'rainbowkit', label: 'RainbowKit' },
]

const AGENTS: { key: EmbedAgent; label: string }[] = [
  { key: 'claude-code', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'copilot', label: 'Copilot' },
]

// Verification checklist: real signals for the first three (verify-url + the integration's optional
// health endpoint), the rest fold into that same result -- see WebsiteEmbedWizard header comment.
const CHECK_STEPS: { label: string; caption: string }[] = [
  { label: 'Detect Markee', caption: 'DETECTING MARKEE…' },
  { label: 'Check View Tracking', caption: 'CHECKING VIEW TRACKING…' },
  { label: 'Check Moderation', caption: 'CHECKING MODERATION…' },
  { label: 'Check Wallet Integration', caption: 'CHECKING WALLET INTEGRATION…' },
  { label: 'Final Test & Confirm', caption: 'RUNNING FINAL TEST…' },
]
const STEP_MIN_MS = 700

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function PillRow<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string }[]
  value: K | null
  onChange: (key: K) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              border: `1px solid ${active ? PINK : BORDER}`,
              background: active ? 'rgba(248,151,254,0.08)' : BG,
              color: active ? PINK : MUTED,
              borderRadius: 8, padding: '8px 14px', fontFamily: MONO, fontSize: 12.5,
              fontWeight: 600, cursor: 'pointer', transition: 'border-color 120ms, color 120ms',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = TEXT }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = MUTED }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function QuestionField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const primaryBtnStyle = (enabled: boolean): React.CSSProperties => ({
  background: enabled ? PINK : 'transparent',
  color: enabled ? BG : MUTED,
  border: enabled ? 'none' : `1px solid ${BORDER}`,
  borderRadius: 8, padding: '12px 22px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
  cursor: enabled ? 'pointer' : 'not-allowed', width: '100%',
  opacity: enabled ? 1 : 0.6, transition: 'opacity 140ms',
})

// ── Main wizard ───────────────────────────────────────────────────────────────
interface WebsiteEmbedWizardProps {
  address: string
  name?: string
  strategy: EmbedStrategy
  onHeaderChange?: (header: { label: string; showBack: boolean }) => void
  onDone?: () => void
}

type Step = 'questions' | 'prompt' | 'verifying' | 'verified'

export function WebsiteEmbedWizard({ address, name, strategy, onHeaderChange, onDone }: WebsiteEmbedWizardProps) {
  const [step, setStep] = useState<Step>('questions')
  const [framework, setFramework] = useState<EmbedFramework | null>('nextjs')
  const [wallet, setWallet] = useState<EmbedWallet>('privy')
  const [agent, setAgent] = useState<EmbedAgent | null>('claude-code')
  const [siteUrl, setSiteUrl] = useState('')
  const [verifyStepIdx, setVerifyStepIdx] = useState(0)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    if (step === 'questions') onHeaderChange?.({ label: 'Add Markee To Your Site', showBack: true })
    else if (step === 'prompt') onHeaderChange?.({ label: 'Add Markee To Your Site', showBack: false })
    else if (step === 'verifying') onHeaderChange?.({ label: 'Verifying Your Site', showBack: false })
    else onHeaderChange?.({ label: 'Markee Added!', showBack: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const canGenerate = !!framework && !!agent

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
    setVerifyStepIdx(1)

    // Steps 1-2: view tracking + moderation, read from the integration's optional health endpoint.
    // The endpoint is optional (see the generated prompt) so an unimplemented/unreachable health check
    // never blocks verification -- Detect Markee above is the only hard gate.
    await Promise.all([
      fetch(`/api/openinternet/check-health?url=${encodeURIComponent(siteUrl)}`).then(r => r.json()).catch(() => null),
      wait(STEP_MIN_MS),
    ])
    if (runId.current !== id) return
    setVerifyStepIdx(2)
    await wait(STEP_MIN_MS)
    if (runId.current !== id) return

    // Step 3: wallet integration has no remote signal Markee can drive -- folds into the checks above.
    setVerifyStepIdx(3)
    await wait(STEP_MIN_MS)
    if (runId.current !== id) return

    // Step 4: final confirm.
    setVerifyStepIdx(4)
    await wait(STEP_MIN_MS)
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
    setStep('prompt')
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

  // ── Prompt ─────────────────────────────────────────────────────────────────
  if (step === 'prompt' && framework && agent) {
    const prompt = buildEmbedPrompt({ address, name, strategy, framework, wallet, agent })
    const agentLabel = AGENTS.find(a => a.key === agent)?.label ?? 'your coding agent'
    return (
      <>
        <button
          onClick={() => setStep('questions')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
            color: PINK, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            padding: 0, marginBottom: 16,
          }}
        >
          ← Edit setup
        </button>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, background: '#030714', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>Paste into {agentLabel} alongside your codebase</span>
            <CopyButton text={prompt} />
          </div>
          <div style={{ padding: '14px 16px', maxHeight: 220, overflowY: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, color: TEXT2, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.65 }}>
              {prompt}
            </pre>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Once deployed
          </div>
          <input
            type="url"
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleVerifyClick() }}
            placeholder="Site URL — e.g. https://yoursite.com"
            style={{
              width: '100%', boxSizing: 'border-box', background: BG, color: TEXT,
              border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px',
              fontFamily: MONO, fontSize: 13, outline: 'none', marginBottom: 12,
            }}
          />
          <button onClick={handleVerifyClick} disabled={!siteUrl.trim()} style={primaryBtnStyle(!!siteUrl.trim())}>
            Verify Site
          </button>
        </div>
      </>
    )
  }

  // ── Questions ──────────────────────────────────────────────────────────────
  return (
    <>
      <p style={{ margin: '0 0 22px', color: TEXT2, fontSize: 14, lineHeight: 1.6 }}>
        Your coding agent can get you set up with a fully functioning Markee integration in minutes.
        Tell us a bit about your site, and generate a prompt to get your LLM going.
      </p>
      <QuestionField label="Framework">
        <PillRow options={FRAMEWORKS} value={framework} onChange={setFramework} />
      </QuestionField>
      <QuestionField label="Wallet library">
        <PillRow options={WALLETS} value={wallet} onChange={setWallet} />
      </QuestionField>
      <QuestionField label="Coding agent">
        <PillRow options={AGENTS} value={agent} onChange={setAgent} />
      </QuestionField>
      <button onClick={() => canGenerate && setStep('prompt')} disabled={!canGenerate} style={primaryBtnStyle(canGenerate)}>
        Generate prompt
      </button>
    </>
  )
}
