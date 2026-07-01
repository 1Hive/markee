'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { IntegrationModal } from '@/components/modals/IntegrationModal'
import { STREAMING_FACTORY, STREAMING_ENABLED } from '@/lib/contracts/addresses'
import { STRATEGIES, type Strategy, type Vertical } from '@/lib/strategy'

const C = {
  bg: '#060A2A', bg2: '#0A0F3D',
  pink: '#F897FE', blue: '#7C9CFF', green: '#1DB227',
  text: '#EDEEFF', text2: '#B8B6D9', muted: '#8A8FBF',
  border: 'rgba(138,143,191,0.2)', borderHover: 'rgba(248,151,254,0.4)',
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// (strategy x vertical) -> factory. Fixed price has a factory per vertical; streaming is
// vertical-agnostic (one factory, vertical stored as board metadata), so all verticals map to it.
const STREAMING_FACTORY_ADDR = (STREAMING_FACTORY || ZERO_ADDRESS) as `0x${string}`
const FACTORIES: Record<Strategy, Record<Vertical, `0x${string}`>> = {
  fixed: {
    openinternet: '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c',
    github:       '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2',
    superfluid:   '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad',
  },
  streaming: {
    openinternet: STREAMING_FACTORY_ADDR,
    github:       STREAMING_FACTORY_ADDR,
    superfluid:   STREAMING_FACTORY_ADDR,
  },
}

const FACTORY_ABI = [{
  inputs: [
    { name: '_beneficiaryAddress', type: 'address' },
    { name: '_leaderboardName', type: 'string' },
  ],
  name: 'createLeaderboard',
  outputs: [
    { name: 'leaderboardAddress', type: 'address' },
    { name: 'seedMarkeeAddress', type: 'address' },
  ],
  stateMutability: 'nonpayable',
  type: 'function',
}] as const

interface VerticalInfo {
  key: Vertical
  name: string
  tagline: string
  color: string
  summary: string
  icon: string
  steps: string[]
  requiresConnect?: 'github'
}

const VERTICALS: VerticalInfo[] = [
  {
    key: 'openinternet',
    name: 'Website',
    tagline: 'Any site you own',
    color: C.pink,
    icon: 'globe',
    summary: 'Add a Markee sign to any website you manage with a highly flexible LLM-guided integration.',
    steps: ['Set up your Markee', 'Deploy Markee', 'Embed & Activate'],
  },
  {
    key: 'github',
    name: 'GitHub Repo',
    tagline: 'README, docs, any markdown',
    color: C.text,
    icon: 'github',
    summary: 'Drop a Markee sign into any markdown file in your repo. Perfect for READMEs, docs and skill.md files.',
    steps: ['Connect GitHub', 'Set up your Markee', 'Deploy Markee', 'Embed & Activate'],
    requiresConnect: 'github',
  },
  {
    key: 'superfluid',
    name: 'Superfluid Project',
    tagline: 'Earn SUP incentives',
    color: C.green,
    icon: 'zap',
    summary: 'Create a Markee sign for your Superfluid project and earn SUP rewards for every message bought.',
    steps: ['Set up your Markee', 'Deploy Markee', 'Activate'],
  },
]

const STRATEGY_KEYS: Strategy[] = ['fixed', 'streaming']

type StepKey = 'strategy' | 'vertical' | 'connect' | 'setup' | 'review' | 'activate'

interface GhUser { connected: boolean; login?: string; avatarUrl?: string }
interface Repo { fullName: string; name: string; owner: string }

// ── Platform glyph ──────────────────────────────────────────────────────────
function PlatGlyph({ icon, size = 24, color }: { icon: string; size?: number; color: string }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24' as const, fill: 'none' as const, stroke: color, strokeWidth: 1.8 as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (icon === 'globe') return <svg {...s}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  if (icon === 'github') return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
  if (icon === 'zap') return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  if (icon === 'tag') return <svg {...s}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
  return <svg {...s}><path d="M12 5v14M5 12h14"/></svg>
}

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 40 }}>
      {steps.map((label, i) => {
        const done = i < current, active = i === current
        return (
          <div key={i} style={{ display: 'contents' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 99, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700 as const, fontFamily: 'var(--font-jetbrains-mono)',
                background: done ? C.pink : 'transparent',
                border: active ? `1px solid ${C.pink}` : done ? 'none' : `1px solid ${C.border}`,
                color: done ? C.bg : active ? C.pink : C.muted,
              }}>
                {done ? <Check size={12} strokeWidth={2.8} /> : i + 1}
              </div>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' as const, color: active ? C.text : done ? C.text2 : C.muted, fontWeight: active ? 600 : 500 }}>{label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, minWidth: 18, height: 1, background: C.border, margin: '0 14px' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── StepShell ────────────────────────────────────────────────────────────────
interface StepShellProps {
  title?: string; sub?: string; children: React.ReactNode
  onBack: () => void; onNext?: () => void
  nextLabel?: string; nextDisabled?: boolean; backLabel?: string
}

function StepShell({ title, sub, children, onBack, onNext, nextLabel, nextDisabled, backLabel }: StepShellProps) {
  return (
    <div>
      {title && <h2 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800 as const, letterSpacing: -0.6, color: C.text }}>{title}</h2>}
      {sub && <p style={{ margin: '0 0 28px', color: C.text2, fontSize: 15, lineHeight: 1.55, maxWidth: '56ch' }}>{sub}</p>}
      {children}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
        <button onClick={onBack} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 20px', color: C.text2, fontSize: 14, cursor: 'pointer' }}>
          {backLabel ?? '← Back'}
        </button>
        {onNext && (
          <button
            onClick={nextDisabled ? undefined : onNext}
            style={{
              background: nextDisabled ? C.bg2 : C.pink,
              color: nextDisabled ? C.muted : C.bg,
              border: nextDisabled ? `1px solid ${C.border}` : 'none',
              borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 700 as const,
              cursor: nextDisabled ? 'default' : 'pointer',
            }}
          >
            {nextLabel ?? 'Continue'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Selection card (shared by strategy + vertical choosers) ──────────────────
function ChoiceCard({ icon, color, name, tagline, summary, on, disabled, badge, onSelect }: {
  icon: string; color: string; name: string; tagline: string; summary: string
  on: boolean; disabled?: boolean; badge?: string; onSelect: () => void
}) {
  return (
    <button onClick={disabled ? undefined : onSelect} disabled={disabled} style={{
      textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
      background: on ? 'rgba(248,151,254,0.06)' : 'rgba(10,15,61,0.5)',
      border: `1px solid ${on ? C.borderHover : C.border}`,
      borderRadius: 14, padding: 20, opacity: disabled ? 0.55 : 1,
      display: 'flex', flexDirection: 'column' as const, gap: 12,
      transition: 'border-color 160ms, background 160ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PlatGlyph icon={icon} color={color} size={24} />
        </div>
        {badge ? (
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 99, padding: '3px 9px' }}>{badge}</span>
        ) : (
          <div style={{ width: 20, height: 20, borderRadius: 99, border: `1px solid ${on ? C.pink : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {on && <div style={{ width: 10, height: 10, borderRadius: 99, background: C.pink }} />}
          </div>
        )}
      </div>
      <div>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{name}</div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>{tagline}</div>
      </div>
      <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>{summary}</div>
    </button>
  )
}

// ── ChooseStrategy ──────────────────────────────────────────────────────────
function ChooseStrategy({ selected, onSelect }: { selected: Strategy | null; onSelect: (s: Strategy) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 8 }}>
      {STRATEGY_KEYS.map(key => {
        const meta = STRATEGIES[key]
        const disabled = key === 'streaming' && !STREAMING_ENABLED
        return (
          <ChoiceCard
            key={key}
            icon={meta.glyph === 'stream' ? 'zap' : 'tag'}
            color={meta.accent}
            name={meta.label}
            tagline={meta.tagline}
            summary={meta.summary}
            on={selected === key}
            disabled={disabled}
            badge={disabled ? 'Coming soon' : undefined}
            onSelect={() => onSelect(key)}
          />
        )
      })}
    </div>
  )
}

// ── ChooseVertical ──────────────────────────────────────────────────────────
function ChooseVertical({ selected, onSelect }: { selected: Vertical | null; onSelect: (k: Vertical) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 8 }}>
      {VERTICALS.map(v => (
        <ChoiceCard
          key={v.key}
          icon={v.icon}
          color={v.color}
          name={v.name}
          tagline={v.tagline}
          summary={v.summary}
          on={selected === v.key}
          onSelect={() => onSelect(v.key)}
        />
      ))}
    </div>
  )
}

// ── ConnectGitHub ─────────────────────────────────────────────────────────
function ConnectGitHub({ ghUser, strategy, onDisconnect }: { ghUser: GhUser; strategy: Strategy; onDisconnect?: () => void }) {
  const returnTo = encodeURIComponent(`/create-a-markee?vertical=github&strategy=${strategy}`)
  return (
    <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, textAlign: 'center' as const }}>
      <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlatGlyph icon="github" color={C.text} size={28} />
      </div>
      {ghUser.connected ? (
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 600, fontSize: 15 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: C.green, display: 'inline-block' }} />
            Connected as <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>@{ghUser.login}</span>
          </div>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>You can now pick a repository and file.</p>
          {onDisconnect && (
            <button
              onClick={onDisconnect}
              style={{ marginTop: 14, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 18px', color: C.muted, fontSize: 12, fontFamily: 'var(--font-jetbrains-mono)', cursor: 'pointer' }}
            >
              Disconnect — use a different account
            </button>
          )}
        </div>
      ) : (
        <div>
          <p style={{ color: C.text2, fontSize: 15, margin: '0 0 20px', lineHeight: 1.55 }}>Connect your GitHub account so we can verify your repo and confirm the Markee integration via the GitHub API.</p>
          <a href={`/api/github/connect?returnTo=${returnTo}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: C.text, color: C.bg, borderRadius: 8, padding: '11px 24px',
            fontSize: 14, fontWeight: 700 as const, textDecoration: 'none',
          }}>
            <PlatGlyph icon="github" color={C.bg} size={18} />
            Connect GitHub
          </a>
        </div>
      )}
    </div>
  )
}

// ── GitHub repo + file picker ───────────────────────────────────────────────
interface GitHubSetupProps {
  repos: Repo[]
  selectedRepo: string | null; setSelectedRepo: (r: string) => void
  selectedFile: string | null; setSelectedFile: (f: string | null) => void
  beneficiary: string; setBeneficiary: (v: string) => void
  onDisconnect?: () => void
}

function GitHubSetup({ repos, selectedRepo, setSelectedRepo, selectedFile, setSelectedFile, beneficiary, setBeneficiary, onDisconnect }: GitHubSetupProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [fileInput, setFileInput] = useState('')

  useEffect(() => {
    if (!selectedRepo) return
    setLoadingFiles(true)
    setFiles([])
    fetch(`/api/github/repo-files?repo=${encodeURIComponent(selectedRepo)}`)
      .then(r => r.ok ? r.json() : { files: [] })
      .then(d => setFiles(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false))
  }, [selectedRepo])

  const mono = 'var(--font-jetbrains-mono)'
  const fieldBase: React.CSSProperties = { width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 14px', color: C.text, fontSize: 14, outline: 'none', fontFamily: mono, boxSizing: 'border-box' }
  const labelCss: React.CSSProperties = { display: 'block', fontFamily: mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 10 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <span style={labelCss}>Repository</span>
        {repos.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, textAlign: 'center' as const }}>
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>No repos found. Make sure you have push access.</p>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                style={{ marginTop: 10, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 14px', color: C.text2, fontSize: 12, fontFamily: 'var(--font-jetbrains-mono)', cursor: 'pointer' }}
              >
                Try a different GitHub account →
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {repos.slice(0, 10).map(r => (
              <button key={r.fullName} onClick={() => { setSelectedRepo(r.fullName); setSelectedFile(null); setFileInput('') }} style={{
                textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                background: selectedRepo === r.fullName ? 'rgba(248,151,254,0.06)' : C.bg,
                border: `1px solid ${selectedRepo === r.fullName ? C.borderHover : C.border}`,
                borderRadius: 8, padding: '12px 14px', color: C.text, fontFamily: mono, fontSize: 13,
              }}>
                <PlatGlyph icon="github" color={C.muted} size={16} /> {r.fullName}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRepo && (
        <div>
          <span style={labelCss}>Markdown file</span>
          {loadingFiles ? (
            <div style={{ color: C.muted, fontSize: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} className="animate-spin" /> Loading files…
            </div>
          ) : files.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {files.slice(0, 12).map(f => (
                <button key={f} onClick={() => setSelectedFile(f)} style={{
                  textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  background: selectedFile === f ? 'rgba(248,151,254,0.06)' : C.bg,
                  border: `1px solid ${selectedFile === f ? C.borderHover : C.border}`,
                  borderRadius: 8, padding: '12px 14px', color: C.text, fontFamily: mono, fontSize: 13,
                }}>
                  <span style={{ color: C.muted }}>📄</span> {f}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <input
                value={fileInput}
                onChange={e => { setFileInput(e.target.value); setSelectedFile(e.target.value.trim() || null) }}
                placeholder="README.md"
                style={fieldBase}
              />
              <span style={{ color: C.muted, fontSize: 12, marginTop: 6, display: 'block' }}>No markdown files found — type a path manually.</span>
            </div>
          )}
        </div>
      )}

      <label style={{ display: 'block' }}>
        <span style={labelCss}>Beneficiary address</span>
        <input value={beneficiary} onChange={e => setBeneficiary(e.target.value)} placeholder="0x... (receives ETH on Base Network)" style={fieldBase} />
      </label>
    </div>
  )
}

// ── Website / Superfluid setup ──────────────────────────────────────────────
function WebsiteSetupFields({ values, setValue, vertical }: {
  values: Record<string, string>; setValue: (k: string, v: string) => void
  vertical: Vertical
}) {
  const mono = 'var(--font-jetbrains-mono)'
  const fieldBase: React.CSSProperties = { width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }
  const labelCss: React.CSSProperties = { display: 'block', fontFamily: mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }

  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
      {vertical === 'openinternet' && (
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={labelCss}>Name this Markee</span>
          <input value={values.siteName ?? ''} onChange={e => setValue('siteName', e.target.value)} placeholder="My Project" style={fieldBase} />
        </label>
      )}
      {vertical === 'superfluid' && (
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={labelCss}>Superfluid project name</span>
          <input value={values.projectName ?? ''} onChange={e => setValue('projectName', e.target.value)} placeholder="My Stream" style={fieldBase} />
        </label>
      )}
      <label style={{ display: 'block' }}>
        <span style={labelCss}>Beneficiary address</span>
        <input value={values.beneficiary ?? ''} onChange={e => setValue('beneficiary', e.target.value)} placeholder="0x... (receives ETH on Base Network)" style={{ ...fieldBase, fontFamily: mono }} />
      </label>
    </div>
  )
}

// ── Review + deploy ─────────────────────────────────────────────────────────
function ReviewSign({ vertical, strategy, values, selectedRepo, selectedFile, isPending, isConfirming, error, isConnected }: {
  vertical: VerticalInfo; strategy: Strategy; values: Record<string, string>
  selectedRepo: string | null; selectedFile: string | null
  isPending: boolean; isConfirming: boolean; error: string | null; isConnected: boolean
}) {
  const mono = 'var(--font-jetbrains-mono)'
  const rows: [string, string][] = [
    ['Strategy', STRATEGIES[strategy].label],
    ['Placement', vertical.name],
    ...(selectedRepo ? [['Repository', selectedRepo] as [string, string]] : []),
    ...(selectedFile ? [['File', selectedFile] as [string, string]] : []),
    ...(vertical.key === 'openinternet' && values.siteName ? [['Name', values.siteName] as [string, string]] : []),
    ...(vertical.key === 'superfluid' && values.projectName ? [['Project name', values.projectName] as [string, string]] : []),
    ['Beneficiary', values.beneficiary ?? '-'],
  ]

  return (
    <div>
      <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 18 }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
            <span style={{ color: C.text, fontSize: 13, fontFamily: mono, textAlign: 'right' as const, wordBreak: 'break-all' as const }}>{v}</span>
          </div>
        ))}
      </div>

      {!isConnected && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: C.text2, fontSize: 14, marginBottom: 10 }}>Connect a wallet to deploy on Base.</p>
          <ConnectButton />
        </div>
      )}

      {error && (
        <div style={{ color: '#F87171', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          ⚠ <span>{error}</span>
        </div>
      )}

      {isPending && <div style={{ textAlign: 'center' as const, color: C.pink, fontFamily: mono, fontSize: 13, marginBottom: 12 }}>Confirm in your wallet…</div>}
      {isConfirming && <div style={{ textAlign: 'center' as const, color: C.muted, fontFamily: mono, fontSize: 13, marginBottom: 12 }}>Deploying on Base…</div>}
    </div>
  )
}

// ── Copy block ──────────────────────────────────────────────────────────────
function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ position: 'relative', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 56px 14px 16px', marginTop: 12 }}>
      <pre style={{ margin: 0, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: C.text2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const, lineHeight: 1.65 }}>{code}</pre>
      <button onClick={() => { navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        style={{ position: 'absolute', top: 10, right: 10, background: copied ? C.green : C.bg2, color: copied ? C.bg : C.text2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, cursor: 'pointer' }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ── Activation guide ────────────────────────────────────────────────────────
function ActivationGuide({ vertical, strategy, leaderboardAddress, selectedFile, name }: {
  vertical: VerticalInfo; strategy: Strategy; leaderboardAddress: string; selectedFile: string | null; name?: string
}) {
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [intModalOpen, setIntModalOpen] = useState(false)
  const addr = leaderboardAddress.toLowerCase()
  const isGithub = vertical.key === 'github'
  const isSuperfluid = vertical.key === 'superfluid'
  const isStreaming = strategy === 'streaming'
  // Embed/verify is a placement (vertical) concern: a streaming GitHub board still needs delimiters.
  // Only Superfluid has no external integration to embed.
  const skipEmbed = isSuperfluid

  const embedCode = isGithub
    ? `<!-- MARKEE:START:${addr} -->\n<!-- MARKEE:END:${addr} -->`
    : `<div data-markee-address="${addr}"></div>\n<script src="https://markee.xyz/api/embed/${leaderboardAddress}" async></script>`

  const handleVerify = async () => {
    setVerifying(true)
    try {
      await new Promise(r => setTimeout(r, 1000))
      setVerified(true)
    } finally {
      setVerifying(false)
    }
  }

  const step = (n: number, title: string, children: React.ReactNode) => (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 99, background: C.pink, color: C.bg, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, fontWeight: 700 as const, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
        <div style={{ color: C.text, fontWeight: 700 as const, fontSize: 16 }}>{title}</div>
      </div>
      <div style={{ paddingLeft: 38 }}>{children}</div>
    </div>
  )

  const confirmedTag = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 600 as const, fontSize: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: C.green, display: 'inline-block' }} />
      Integration confirmed
    </span>
  )

  let n = 1
  return (
    <div>
      {!skipEmbed && step(n++, isGithub ? 'Add the Markee delimiters to your markdown file' : 'Embed on your site',
        <div>
          <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 4px' }}>
            {isGithub
              ? `Paste the snippet below into ${selectedFile ?? 'your markdown file'}, then commit the change.`
              : 'Copy and paste the snippet below, or use the integration guide to get a full AI prompt.'}
          </p>
          <CopyBlock code={embedCode} />
          {!isGithub && (
            <button
              onClick={() => setIntModalOpen(true)}
              style={{ marginTop: 12, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 16px', color: C.text2, fontSize: 13, fontFamily: 'var(--font-jetbrains-mono)', cursor: 'pointer' }}
            >
              Open integration guide →
            </button>
          )}
        </div>
      )}

      <IntegrationModal
        isOpen={intModalOpen}
        onClose={() => setIntModalOpen(false)}
        leaderboard={{ address: leaderboardAddress, name: name ?? leaderboardAddress }}
      />

      {!skipEmbed && step(n++, 'Verify Integration',
        <div>
          <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
            {isGithub ? 'Click once your delimiter is committed.' : 'Click once your embed is live on the site.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {verified ? confirmedTag : (
              <button onClick={handleVerify} disabled={verifying} style={{
                background: verifying ? C.bg2 : C.pink, color: verifying ? C.muted : C.bg,
                border: verifying ? `1px solid ${C.border}` : 'none',
                borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 700 as const,
                cursor: verifying ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {verifying && <Loader2 size={14} className="animate-spin" />}
                {verifying ? 'Checking…' : isGithub ? 'Check Integration' : 'Confirm Integration'}
              </button>
            )}
          </div>
        </div>
      )}

      {step(skipEmbed ? 1 : n, 'Activate your Markee',
        <div>
          <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
            {isStreaming
              ? 'Add a message and open a stream to claim the #1 spot on your board.'
              : 'Buy the first message to activate your Markee.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Link href={`/markee/${leaderboardAddress}`} style={{
              background: C.pink, color: C.bg, borderRadius: 8, padding: '11px 24px',
              fontSize: 14, fontWeight: 700 as const, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {isStreaming ? 'Open your board →' : 'View your Markee →'}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inner wizard (uses useSearchParams) ─────────────────────────────────────
function CreateWizardInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isConnected } = useAccount()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [vertical, setVertical] = useState<Vertical | null>(null)
  const [step, setStep] = useState(0)
  const [values, setValuesRaw] = useState<Record<string, string>>({})
  const [ghUser, setGhUser] = useState<GhUser>({ connected: false })
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // Deep-link via ?strategy= / ?vertical= (and legacy ?platform= where streaming was a "platform").
  useEffect(() => {
    const verticals = VERTICALS.map(v => v.key)
    const strategyParam = searchParams.get('strategy') as Strategy | null
    const verticalParam = searchParams.get('vertical') as Vertical | null
    const platformParam = searchParams.get('platform')
    const resolvedStrategy: Strategy =
      strategyParam === 'streaming' && STREAMING_ENABLED ? 'streaming' : 'fixed'

    if (verticalParam && verticals.includes(verticalParam)) {
      setStrategy(resolvedStrategy)
      setVertical(verticalParam)
      setStep(2)
      return
    }
    if (platformParam === 'streaming' && STREAMING_ENABLED) {
      setStrategy('streaming'); setStep(1); return
    }
    if (platformParam && verticals.includes(platformParam as Vertical)) {
      setStrategy('fixed'); setVertical(platformParam as Vertical); setStep(2)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check GitHub on mount
  useEffect(() => {
    fetch('/api/github/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.connected) {
          setGhUser({ connected: true, login: d.login, avatarUrl: d.avatarUrl })
          fetch('/api/github/my-repos')
            .then(r => r.ok ? r.json() : { repos: [] })
            .then(d => setRepos(Array.isArray(d.repos) ? d.repos : []))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  // Auto-advance past the connect step once GitHub is confirmed connected (post-OAuth return)
  useEffect(() => {
    if (ghUser.connected && stepKey === 'connect') setStep(s => s + 1)
  }, [ghUser.connected]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle confirmed tx
  useEffect(() => {
    if (!isSuccess || !receipt || !strategy || !vertical) return
    const factoryAddr = FACTORIES[strategy][vertical].toLowerCase()
    let found: string | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === factoryAddr && log.topics[1]) {
        found = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    if (!found) return
    setNewLeaderboardAddress(found)
    if (vertical === 'github' && selectedRepo && selectedFile) {
      fetch('/api/github/register-markee', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: found, repoFullName: selectedRepo, filePath: selectedFile }),
      }).catch(() => {})
    }
    // Streaming boards are vertical-agnostic on-chain; tag the placement off-chain so it surfaces on
    // the right vertical listing.
    if (strategy === 'streaming') {
      fetch('/api/streaming/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: found, vertical }),
      }).catch(() => {})
    }
    setStep(s => s + 1)
  }, [isSuccess, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (k: string, v: string) => setValuesRaw(prev => ({ ...prev, [k]: v }))

  const vInfo = vertical ? VERTICALS.find(v => v.key === vertical)! : null

  const stepKeys: StepKey[] = useMemo(() => {
    if (!strategy) return ['strategy']
    if (!vInfo) return ['strategy', 'vertical']
    return vInfo.requiresConnect === 'github'
      ? ['strategy', 'vertical', 'connect', 'setup', 'review', 'activate']
      : ['strategy', 'vertical', 'setup', 'review', 'activate']
  }, [strategy, vInfo?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const stepKey = stepKeys[step] ?? 'strategy'

  const fieldsComplete = useMemo(() => {
    if (!vInfo) return false
    const b = /^0x[0-9a-fA-F]{40}$/.test(values.beneficiary ?? '')
    if (vInfo.key === 'openinternet') return !!(values.siteName?.trim() && b)
    if (vInfo.key === 'github') return !!(selectedRepo && selectedFile && b)
    if (vInfo.key === 'superfluid') return !!(values.projectName?.trim() && b)
    return false
  }, [vInfo, values, selectedRepo, selectedFile])

  const go = (d: number) => setStep(s => Math.max(0, Math.min(s + d, stepKeys.length - 1)))

  const handleDisconnect = async () => {
    await fetch('/api/github/me', { method: 'DELETE' }).catch(() => {})
    setGhUser({ connected: false })
    setRepos([])
    setSelectedRepo(null)
    setSelectedFile(null)
    setStep(stepKeys.indexOf('connect'))
  }

  const handleDeploy = () => {
    setTxError(null)
    if (!strategy || !vertical) return
    const bene = values.beneficiary?.trim() ?? ''
    if (!/^0x[0-9a-fA-F]{40}$/.test(bene)) { setTxError('Enter a valid beneficiary address.'); return }
    const name =
      vertical === 'openinternet' ? (values.siteName?.trim() || 'My Website') :
      vertical === 'github' ? (selectedRepo?.split('/').pop() ?? 'My Repo') :
      (values.projectName?.trim() || 'My Project')
    resetWrite()
    writeContract({
      address: FACTORIES[strategy][vertical],
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [bene as `0x${string}`, name],
    })
  }

  const busy = isPending || isConfirming

  return (
    <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px' }}>
      <Link href="/raise-funding" style={{ color: C.muted, textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-jetbrains-mono)' }}>← Raise Funding</Link>
      <h1 style={{ margin: '14px 0 32px', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, letterSpacing: -1, color: C.text }}>
        {stepKey === 'strategy' ? 'Choose a pricing strategy' : stepKey === 'vertical' ? 'Choose where it lives' : 'Create a Markee'}
      </h1>

      {step >= 2 && vInfo && (
        <Stepper steps={vInfo.steps} current={Math.min(step - 2, vInfo.steps.length - 1)} />
      )}

      {stepKey === 'strategy' && (
        <StepShell
          sub="Pick how backers pay to hold the top message. You choose where the board lives next."
          onBack={() => router.back()} backLabel="Cancel" onNext={() => go(1)} nextDisabled={!strategy}
        >
          <ChooseStrategy selected={strategy} onSelect={setStrategy} />
        </StepShell>
      )}

      {stepKey === 'vertical' && (
        <StepShell
          sub="Pick where your board lives. The pricing strategy stays the same wherever you place it."
          onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!vertical}
        >
          <ChooseVertical selected={vertical} onSelect={setVertical} />
        </StepShell>
      )}

      {stepKey === 'connect' && (
        <StepShell
          title="Connect GitHub"
          sub="We use your connection to add the Markee delimiter and confirm it via the GitHub API."
          onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!ghUser.connected}
        >
          <ConnectGitHub ghUser={ghUser} strategy={strategy ?? 'fixed'} onDisconnect={handleDisconnect} />
        </StepShell>
      )}

      {stepKey === 'setup' && vInfo && (
        <StepShell
          title="Set up your Markee"
          sub="Name your Markee and set a beneficiary address to receive funds."
          onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!fieldsComplete}
        >
          {vInfo.key === 'github' ? (
            <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
              <GitHubSetup
                repos={repos}
                selectedRepo={selectedRepo} setSelectedRepo={r => { setSelectedRepo(r); setSelectedFile(null) }}
                selectedFile={selectedFile} setSelectedFile={setSelectedFile}
                beneficiary={values.beneficiary ?? ''} setBeneficiary={v => setValue('beneficiary', v)}
                onDisconnect={handleDisconnect}
              />
            </div>
          ) : (
            <WebsiteSetupFields values={values} setValue={setValue} vertical={vInfo.key} />
          )}
        </StepShell>
      )}

      {stepKey === 'review' && vInfo && strategy && (
        <StepShell
          title="Deploy Markee"
          sub="Review your info and sign the transaction to deploy your Markee on Base."
          onBack={() => go(-1)}
          onNext={busy ? undefined : handleDeploy}
          nextLabel={isPending ? 'Confirm in wallet…' : isConfirming ? 'Deploying…' : 'Deploy Markee'}
          nextDisabled={!isConnected || busy}
        >
          <ReviewSign
            vertical={vInfo} strategy={strategy} values={values}
            selectedRepo={selectedRepo} selectedFile={selectedFile}
            isPending={isPending} isConfirming={isConfirming}
            error={txError ?? (writeError ? (writeError as Error).message : null)}
            isConnected={isConnected}
          />
        </StepShell>
      )}

      {stepKey === 'activate' && vInfo && strategy && newLeaderboardAddress && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(29,178,39,0.08)', border: `1px solid ${C.green}`, borderRadius: 14, padding: '20px 22px', marginBottom: 26 }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 99, background: 'rgba(29,178,39,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={22} color={C.green} strokeWidth={2.6} />
            </div>
            <div>
              <div style={{ color: C.text, fontWeight: 700 as const, fontSize: 17 }}>Transaction confirmed</div>
              <p style={{ color: C.text2, fontSize: 14, margin: '4px 0 0', lineHeight: 1.55 }}>
                Your {vInfo.name} Markee was deployed onchain.{' '}
                {hash && (
                  <a href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-jetbrains-mono)', color: C.blue, textDecoration: 'none', borderBottom: `1px dotted ${C.blue}` }}>
                    {hash.slice(0, 6)}…{hash.slice(-4)} ↗
                  </a>
                )}
              </p>
            </div>
          </div>

          <ActivationGuide vertical={vInfo} strategy={strategy} leaderboardAddress={newLeaderboardAddress} selectedFile={selectedFile} name={values.name} />

          <div style={{ marginTop: 14, paddingTop: 24, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
            <Link href="/account" style={{
              background: C.pink, color: C.bg, borderRadius: 8, padding: '11px 24px',
              fontSize: 14, fontWeight: 700 as const, textDecoration: 'none',
            }}>
              Go to my dashboard →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CreateAMarkee() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header activePage="raise" useRegularLinks />
      <Suspense>
        <CreateWizardInner />
      </Suspense>
    </div>
  )
}
