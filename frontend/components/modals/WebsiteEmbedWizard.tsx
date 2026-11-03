'use client'

import { useEffect, useRef, useState } from 'react'
import { CopyButton } from '@/components/board-detail/shared'
import { TxSteps, TxRing } from '@/components/modals/StreamUI'
import {
  buildEmbedPrompt,
  type EmbedStrategy,
} from '@/lib/embedPrompt/fragments'
import { MONO, BG, PINK, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'

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
  if (step === 'prompt') {
    const prompt = buildEmbedPrompt({ address, name, strategy })
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
          ← Integration steps
        </button>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, background: '#030714', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>Paste into your coding assistant alongside your codebase</span>
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
        Add this existing leaderboard with the Markee SDK. Your coding assistant will inspect your app,
        choose the React or vanilla JavaScript integration, and reuse your existing wallet setup.
      </p>
      <ol style={{ margin: '0 0 24px', paddingLeft: 22, color: TEXT2, fontSize: 14, lineHeight: 1.8 }}>
        <li>Copy the SDK prompt into your coding assistant with access to your codebase.</li>
        <li>Confirm sign placement, theme, and any missing requirements. Let it implement and test the SDK.</li>
        <li>Deploy your app, then return here with the public page URL to verify your Markee.</li>
      </ol>
      <p style={{ color: MUTED, fontSize: 12, marginBottom: 20 }}>Works with ChatGPT, Codex, Claude Code, Cursor, or any coding assistant.</p>
      <button onClick={() => setStep('prompt')} style={primaryBtnStyle(true)}>
        Generate prompt
      </button>
    </>
  )
}
