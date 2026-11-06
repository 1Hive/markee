'use client'

import { useEffect, useRef, useState } from 'react'
import { CopyButton } from '@/components/board-detail/shared'
import { TxSteps, TxRing } from '@/components/modals/StreamUI'
import {
  buildEmbedPrompt,
  EMBED_MODERATION_PRESETS,
  type EmbedStrategy,
} from '@/lib/embedPrompt/fragments'
import { Copy, Code2, ExternalLink, Info, Sparkles } from 'lucide-react'
import styles from './WebsiteEmbedWizard.module.css'
import { MONO, BG, PINK, TEXT, MUTED, BORDER } from '@/lib/design-tokens'

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

type Step = 'setup' | 'verifying' | 'verified'

export function WebsiteEmbedWizard({ address, name, strategy, onHeaderChange, onDone }: WebsiteEmbedWizardProps) {
  const [step, setStep] = useState<Step>('setup')
  const [severity, setSeverity] = useState<keyof typeof EMBED_MODERATION_PRESETS>('standard')
  const [integration, setIntegration] = useState<'ai' | 'sdk'>('ai')
  const [codeFormat, setCodeFormat] = useState<'react' | 'vanilla'>('react')
  const playgroundUrl = `https://markee-sdk-connectkit-example.vercel.app/?${new URLSearchParams({ integration: codeFormat, board: address, severity, strategy: strategy === 'streaming' ? 'ForRent' : 'ForSale' })}#sdk-configuration`
  const [siteUrl, setSiteUrl] = useState('')
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

  const prompt = buildEmbedPrompt({ address, name, strategy, severity })
  const marker = `<span hidden data-markee-address="${address}"></span>`
  const reactCode = `'use client';
import { MarkeeSign } from '@markee_team/sdk/react';

export default function SiteMarkee() {
  return <MarkeeSign
    placement={{ kind: 'board', chainId: 8453, address: '${address}' }}
    moderation={{ severity: '${severity}' }}
    theme={{ mode: 'system' }}
    siteUrl="https://your-site.com"
  />;
}`
  const vanillaCode = `import { createMarkeeSign } from '@markee_team/sdk';

const sign = createMarkeeSign(document.querySelector('#markee'), {
  placement: { kind: 'board', chainId: 8453, address: '${address}' },
  moderation: { severity: '${severity}' },
  theme: { mode: 'system' },
  siteUrl: 'https://your-site.com',
});

// On page teardown:
// sign.destroy();`
  const code = codeFormat === 'react' ? reactCode : vanillaCode

  return (
    <div className={styles.wizard}>
      <div className={styles.segments} role="group" aria-label="Integration method">
        <button type="button" aria-pressed={integration === 'ai'} onClick={() => setIntegration('ai')}>
          <Sparkles size={18} aria-hidden="true" /> Use AI
        </button>
        <button type="button" aria-pressed={integration === 'sdk'} onClick={() => setIntegration('sdk')}>
          <Code2 size={20} aria-hidden="true" /> Install SDK
        </button>
      </div>

      {integration === 'ai' ? (
        <div className={styles.aiIntro}>
          <ol className={styles.steps}>
            <li>Paste the prompt into your coding assistant</li>
            <li>Confirm placement, let it build &amp; test</li>
            <li>Deploy, then verify your page below</li>
          </ol>
          <p className={styles.assistants}>Works with Claude Code, Cursor, Codex, ChatGPT…</p>
        </div>
      ) : (
        <div className={styles.sdkSteps}>
          <section aria-labelledby="embed-install-label">
            <h3 id="embed-install-label" className={styles.label}>1 · Install</h3>
            <div className={styles.copyRow}>
              <code><span className={styles.dollar} aria-hidden="true">$ </span>npm i @markee_team/sdk@latest</code>
              <CopyButton text="npm i @markee_team/sdk@latest" />
            </div>
          </section>
          <section aria-labelledby="embed-address-label">
            <h3 id="embed-address-label" className={styles.label}>2 · Your Markee address</h3>
            <div className={styles.copyRow}>
              <code className={styles.address} title={address}>{address}</code>
              <CopyButton text={address} />
            </div>
          </section>
          <section aria-labelledby="embed-code-label">
            <div className={styles.codeHeading}>
              <h3 id="embed-code-label" className={styles.label}>3 · Add to your app</h3>
              <div className={styles.formats} role="group" aria-label="Code format">
                {(['react', 'vanilla'] as const).map(format => (
                  <button key={format} type="button" aria-pressed={codeFormat === format} onClick={() => setCodeFormat(format)}>
                    {format === 'react' ? 'React' : 'Vanilla JS'}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.codeBlock}>
              <div className={styles.codeCopy}><CopyButton text={code} /></div>
              <pre tabIndex={0} aria-label={`${codeFormat === 'react' ? 'React' : 'Vanilla JavaScript'} integration code`}><code>{code}</code></pre>
            </div>
            <a className={styles.link} href="https://www.npmjs.com/package/@markee_team/sdk" target="_blank" rel="noopener noreferrer">
              Full docs on npm <ExternalLink size={14} aria-hidden="true" />
            </a>
            <details className={styles.setupNotes}>
              <summary>Deployment &amp; customization</summary>
              <p>Commit your lockfile. Replace the example site URL with your public HTTPS page. Match your app’s colors, typography, and radii through the SDK theme. Reuse your app’s wallet with a wallet adapter.</p>
              {codeFormat === 'vanilla' && <p>Add <code>{'<div id="markee"></div>'}</code> to your page before creating the sign.</p>}
              <p>For client-rendered apps, add this verification marker to your server’s HTML (for example, Vite’s index.html). React server rendering already includes it.</p>
              <div className={styles.codeBlock}>
                <div className={styles.codeCopy}><CopyButton text={marker} /></div>
                <pre tabIndex={0}><code>{marker}</code></pre>
              </div>
              <a className={styles.link} href={playgroundUrl} target="_blank" rel="noopener noreferrer">Customize in the playground <ExternalLink size={14} aria-hidden="true" /></a>
              <p>No API URL or provider credentials are needed. For Sale or For Rent is detected automatically.</p>
            </details>
          </section>
        </div>
      )}

      <fieldset className={styles.moderation}>
        <legend className={styles.label}>Moderation</legend>
        <details className={styles.moderationInfo}>
          <summary aria-label="About moderation"><Info size={20} aria-hidden="true" /></summary>
          <p>Applies to this integration. Manual flags still apply. Content stays hidden when moderation is unavailable.</p>
        </details>
        <div className={styles.moderationCards} role="group" aria-label="Moderation severity">
          {(Object.keys(EMBED_MODERATION_PRESETS) as (keyof typeof EMBED_MODERATION_PRESETS)[]).map(value => (
            <button key={value} type="button" aria-pressed={severity === value} onClick={() => setSeverity(value)}>
              <span className={styles.cardTitle}>{EMBED_MODERATION_PRESETS[value].label}</span>
              <span className={styles.cardDescription}>{EMBED_MODERATION_PRESETS[value].description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {integration === 'ai' && <PromptCopyButton text={prompt} />}

      <form className={styles.verify} onSubmit={event => { event.preventDefault(); handleVerifyClick() }}>
        <label htmlFor="embed-site-url" className={styles.label}>Deployed? Verify</label>
        <div className={styles.verifyRow}>
          <input id="embed-site-url" type="url" required value={siteUrl} onChange={event => setSiteUrl(event.target.value)} placeholder="https://yoursite.com/page" />
          <button type="submit" disabled={!siteUrl.trim()}>Verify</button>
        </div>
      </form>
    </div>
  )
}

function PromptCopyButton({ text }: { text: string }) {
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const copied = copiedText === text

  useEffect(() => {
    if (!copiedText) return
    const timeout = setTimeout(() => setCopiedText(null), 2000)
    return () => clearTimeout(timeout)
  }, [copiedText])

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      setError(false)
    } catch {
      setError(true)
    }
  }

  return <>
    <button type="button" onClick={copyPrompt} className={styles.copyPrompt}>
      <Copy size={18} aria-hidden="true" /> {copied ? 'Prompt copied!' : 'Copy Prompt'}
    </button>
    <span role="status" className={styles.copyStatus}>{copied ? 'Prompt copied to clipboard.' : ''}</span>
    {error && <div className={styles.copyFallback}>
      <p role="alert">Clipboard unavailable. Select and copy the prompt below.</p>
      <textarea readOnly aria-label="Integration prompt" value={text} onFocus={event => event.target.select()} />
    </div>}
  </>
}
