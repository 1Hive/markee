'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'

const C = {
  bg: '#060A2A', bg2: '#0A0F3D',
  pink: '#F897FE', blue: '#7C9CFF', green: '#1DB227',
  text: '#EDEEFF', text2: '#B8B6D9', muted: '#8A8FBF',
  border: 'rgba(138,143,191,0.2)', borderHover: 'rgba(248,151,254,0.4)',
}

const FACTORIES = {
  openinternet: '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c' as const,
  github:       '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2' as const,
  superfluid:   '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as const,
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

type PlatformKey = 'openinternet' | 'github' | 'superfluid'

interface Platform {
  key: PlatformKey
  name: string
  tagline: string
  color: string
  summary: string
  steps: string[]
  requiresConnect?: 'github'
}

const PLATFORMS: Platform[] = [
  {
    key: 'openinternet',
    name: 'Website',
    tagline: 'Any site you own',
    color: C.pink,
    summary: 'Add a Markee sign to any website you manage with a highly flexible LLM-guided integration.',
    steps: ['Set up your Markee', 'Deploy Markee', 'Embed & Activate'],
  },
  {
    key: 'github',
    name: 'GitHub Repo',
    tagline: 'README, docs, any markdown',
    color: C.text,
    summary: 'Drop a Markee sign into any markdown file in your repo. Perfect for READMEs, docs and skill.md files.',
    steps: ['Connect GitHub', 'Set up your Markee', 'Deploy Markee', 'Embed & Activate'],
    requiresConnect: 'github',
  },
  {
    key: 'superfluid',
    name: 'Superfluid Project',
    tagline: 'Earn SUP incentives',
    color: C.green,
    summary: 'Create a Markee sign for your Superfluid project and earn SUP rewards for every message bought.',
    steps: ['Set up your Markee', 'Deploy Markee', 'Activate'],
  },
]

type StepKey = 'choose' | 'connect' | 'setup' | 'review' | 'activate'

interface GhUser { connected: boolean; login?: string; avatarUrl?: string }
interface Repo { fullName: string; name: string; owner: string }

function deriveSiteName(url: string): string {
  if (!url) return ''
  const host = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0]
  const root = (host || '').split('.')[0]
  if (!root) return ''
  return root.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

// ── Platform glyph ──────────────────────────────────────────────────────────
function PlatGlyph({ icon, size = 24, color }: { icon: string; size?: number; color: string }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24' as const, fill: 'none' as const, stroke: color, strokeWidth: 1.8 as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (icon === 'globe') return <svg {...s}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  if (icon === 'github') return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
  if (icon === 'zap') return <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
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

// ── ChoosePlatform ──────────────────────────────────────────────────────────
function ChoosePlatform({ selected, onSelect }: { selected: PlatformKey | null; onSelect: (k: PlatformKey) => void }) {
  const icons: Record<PlatformKey, string> = { openinternet: 'globe', github: 'github', superfluid: 'zap' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 8 }}>
      {PLATFORMS.map(p => {
        const on = selected === p.key
        return (
          <button key={p.key} onClick={() => onSelect(p.key)} style={{
            textAlign: 'left', cursor: 'pointer',
            background: on ? 'rgba(248,151,254,0.06)' : 'rgba(10,15,61,0.5)',
            border: `1px solid ${on ? C.borderHover : C.border}`,
            borderRadius: 14, padding: 20,
            display: 'flex', flexDirection: 'column' as const, gap: 12,
            transition: 'border-color 160ms, background 160ms',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PlatGlyph icon={icons[p.key]} color={p.color} size={24} />
              </div>
              <div style={{ width: 20, height: 20, borderRadius: 99, border: `1px solid ${on ? C.pink : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <div style={{ width: 10, height: 10, borderRadius: 99, background: C.pink }} />}
              </div>
            </div>
            <div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{p.name}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>{p.tagline}</div>
            </div>
            <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>{p.summary}</div>
          </button>
        )
      })}
    </div>
  )
}

// ── ConnectGitHub ─────────────────────────────────────────────────────────
function ConnectGitHub({ ghUser }: { ghUser: GhUser }) {
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
        </div>
      ) : (
        <div>
          <p style={{ color: C.text2, fontSize: 15, margin: '0 0 20px', lineHeight: 1.55 }}>Connect your GitHub account so we can verify your repo and confirm the Markee integration via the GitHub API.</p>
          <a href="/api/github/connect?returnTo=/create-a-markee?platform=github" style={{
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
}

function GitHubSetup({ repos, selectedRepo, setSelectedRepo, selectedFile, setSelectedFile, beneficiary, setBeneficiary }: GitHubSetupProps) {
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
          <div style={{ color: C.muted, fontSize: 14, padding: 16, border: `1px solid ${C.border}`, borderRadius: 8, textAlign: 'center' as const }}>No repos found. Make sure you have push access.</div>
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
function WebsiteSetupFields({ values, setValue, platformKey, nameAuto }: {
  values: Record<string, string>; setValue: (k: string, v: string) => void
  platformKey: PlatformKey; nameAuto: boolean
}) {
  const mono = 'var(--font-jetbrains-mono)'
  const fieldBase: React.CSSProperties = { width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }
  const labelCss: React.CSSProperties = { display: 'block', fontFamily: mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }

  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
      {platformKey === 'openinternet' && <>
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={labelCss}>Site URL</span>
          <input value={values.siteUrl ?? ''} onChange={e => setValue('siteUrl', e.target.value)} placeholder="https://myproject.xyz" type="url" style={fieldBase} />
        </label>
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={labelCss}>Site name</span>
          <input value={values.siteName ?? ''} onChange={e => setValue('siteName', e.target.value)} placeholder="My Project" style={fieldBase} />
          {nameAuto && values.siteName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontFamily: mono, fontSize: 11, color: C.blue }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
              Pulled from site metadata
            </span>
          )}
        </label>
      </>}
      {platformKey === 'superfluid' && (
        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={labelCss}>Superfluid project name</span>
          <input value={values.projectName ?? ''} onChange={e => setValue('projectName', e.target.value)} placeholder="My Stream" style={fieldBase} />
        </label>
      )}
      <label style={{ display: 'block', marginBottom: platformKey === 'openinternet' ? 20 : 0 }}>
        <span style={labelCss}>Beneficiary address</span>
        <input value={values.beneficiary ?? ''} onChange={e => setValue('beneficiary', e.target.value)} placeholder="0x... (receives ETH on Base Network)" style={{ ...fieldBase, fontFamily: mono }} />
      </label>
      {platformKey === 'openinternet' && (
        <label style={{ display: 'block' }}>
          <span style={labelCss}>Logo URL <span style={{ color: C.muted, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></span>
          <input value={values.logoUrl ?? ''} onChange={e => setValue('logoUrl', e.target.value)} placeholder="https://yoursite.com/logo.png" type="url" style={fieldBase} />
        </label>
      )}
    </div>
  )
}

// ── Review + deploy ─────────────────────────────────────────────────────────
function ReviewSign({ platform, values, selectedRepo, selectedFile, isPending, isConfirming, error, isConnected }: {
  platform: Platform; values: Record<string, string>
  selectedRepo: string | null; selectedFile: string | null
  isPending: boolean; isConfirming: boolean; error: string | null; isConnected: boolean
}) {
  const mono = 'var(--font-jetbrains-mono)'
  const rows: [string, string][] = [
    ['Integration platform', platform.name],
    ...(selectedRepo ? [['Repository', selectedRepo] as [string, string]] : []),
    ...(selectedFile ? [['File', selectedFile] as [string, string]] : []),
    ...(platform.key === 'openinternet' && values.siteUrl ? [['Site URL', values.siteUrl] as [string, string]] : []),
    ...(platform.key === 'openinternet' && values.siteName ? [['Site name', values.siteName] as [string, string]] : []),
    ...(platform.key === 'superfluid' && values.projectName ? [['Project name', values.projectName] as [string, string]] : []),
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
function ActivationGuide({ platform, leaderboardAddress, selectedFile }: {
  platform: Platform; leaderboardAddress: string; selectedFile: string | null
}) {
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const addr = leaderboardAddress.toLowerCase()
  const isGithub = platform.key === 'github'
  const isSuperfluid = platform.key === 'superfluid'

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
      {!isSuperfluid && step(n++, isGithub ? 'Add the Markee delimiters to your markdown file' : 'Embed on your site',
        <div>
          <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 4px' }}>
            {isGithub
              ? `Paste the snippet below into ${selectedFile ?? 'your markdown file'}, then commit the change.`
              : 'Copy and paste the snippet. Or paste the instructions into an LLM with repo access.'}
          </p>
          <CopyBlock code={embedCode} />
        </div>
      )}

      {!isSuperfluid && step(n++, 'Verify Integration',
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

      {step(isSuperfluid ? 1 : n, 'Activate your Markee',
        <div>
          <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
            Buy the first message to activate your Markee.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Link href={`/markee/${leaderboardAddress}`} style={{
              background: C.pink, color: C.bg, borderRadius: 8, padding: '11px 24px',
              fontSize: 14, fontWeight: 700 as const, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              View your Markee →
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

  const [platformKey, setPlatformKey] = useState<PlatformKey | null>(null)
  const [step, setStep] = useState(0)
  const [values, setValuesRaw] = useState<Record<string, string>>({})
  const [nameTouched, setNameTouched] = useState(false)
  const [nameAuto, setNameAuto] = useState(false)
  const [ghUser, setGhUser] = useState<GhUser>({ connected: false })
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // Deep-link via ?platform=
  useEffect(() => {
    const p = searchParams.get('platform') as PlatformKey | null
    if (p && PLATFORMS.find(pl => pl.key === p)) { setPlatformKey(p); setStep(1) }
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

  // Auto-fill site name from URL
  useEffect(() => {
    if (platformKey !== 'openinternet' || nameTouched) return
    const derived = deriveSiteName(values.siteUrl ?? '')
    if (derived) {
      setValuesRaw(prev => ({ ...prev, siteName: derived }))
      setNameAuto(true)
    }
  }, [values.siteUrl, platformKey, nameTouched])

  // Handle confirmed tx
  useEffect(() => {
    if (!isSuccess || !receipt || !platformKey) return
    const factoryAddr = FACTORIES[platformKey].toLowerCase()
    let found: string | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === factoryAddr && log.topics[1]) {
        found = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    if (!found) return
    setNewLeaderboardAddress(found)
    if (platformKey === 'openinternet' && values.logoUrl?.trim()) {
      fetch('/api/openinternet/meta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: found, logoUrl: values.logoUrl.trim() }),
      }).catch(() => {})
    }
    if (platformKey === 'github' && selectedRepo && selectedFile) {
      fetch('/api/github/register-markee', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress: found, repoFullName: selectedRepo, filePath: selectedFile }),
      }).catch(() => {})
    }
    setStep(s => s + 1)
  }, [isSuccess, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (k: string, v: string) => {
    if (k === 'siteName') { setNameTouched(true); setNameAuto(false) }
    setValuesRaw(prev => ({ ...prev, [k]: v }))
  }

  const platform = platformKey ? PLATFORMS.find(p => p.key === platformKey)! : null

  const stepKeys: StepKey[] = useMemo(() => {
    if (!platform) return ['choose']
    return platform.requiresConnect === 'github'
      ? ['choose', 'connect', 'setup', 'review', 'activate']
      : ['choose', 'setup', 'review', 'activate']
  }, [platform?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const stepKey = stepKeys[step] ?? 'choose'

  const fieldsComplete = useMemo(() => {
    if (!platform) return false
    const b = /^0x[0-9a-fA-F]{40}$/.test(values.beneficiary ?? '')
    if (platform.key === 'openinternet') return !!(values.siteUrl?.trim() && values.siteName?.trim() && b)
    if (platform.key === 'github') return !!(selectedRepo && selectedFile && b)
    if (platform.key === 'superfluid') return !!(values.projectName?.trim() && b)
    return false
  }, [platform, values, selectedRepo, selectedFile])

  const go = (d: number) => setStep(s => Math.max(0, Math.min(s + d, stepKeys.length - 1)))

  const handleDeploy = () => {
    setTxError(null)
    if (!platformKey) return
    const bene = values.beneficiary?.trim() ?? ''
    if (!/^0x[0-9a-fA-F]{40}$/.test(bene)) { setTxError('Enter a valid beneficiary address.'); return }
    const name =
      platformKey === 'openinternet' ? (values.siteName?.trim() ?? 'My Website') :
      platformKey === 'github' ? (selectedRepo?.split('/').pop() ?? 'My Repo') :
      (values.projectName?.trim() ?? 'My Project')
    resetWrite()
    writeContract({
      address: FACTORIES[platformKey],
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
        {step === 0 ? 'Choose a Platform' : 'Create a Markee'}
      </h1>

      {step > 0 && platform && (
        <Stepper steps={platform.steps} current={Math.min(step - 1, platform.steps.length - 1)} />
      )}

      {stepKey === 'choose' && (
        <StepShell onBack={() => router.back()} backLabel="Cancel" onNext={() => go(1)} nextDisabled={!platformKey}>
          <ChoosePlatform selected={platformKey} onSelect={setPlatformKey} />
        </StepShell>
      )}

      {stepKey === 'connect' && (
        <StepShell
          title="Connect GitHub"
          sub="We use your connection to add the Markee delimiter and confirm it via the GitHub API."
          onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!ghUser.connected}
        >
          <ConnectGitHub ghUser={ghUser} />
        </StepShell>
      )}

      {stepKey === 'setup' && platform && (
        <StepShell
          title="Set up your Markee"
          sub={platform.key === 'openinternet' ? 'Set the domain where your Markee will live and an address to receive funds.' : 'Configure your Markee and set a beneficiary address to receive funds.'}
          onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!fieldsComplete}
        >
          {platform.key === 'github' ? (
            <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
              <GitHubSetup
                repos={repos}
                selectedRepo={selectedRepo} setSelectedRepo={r => { setSelectedRepo(r); setSelectedFile(null) }}
                selectedFile={selectedFile} setSelectedFile={setSelectedFile}
                beneficiary={values.beneficiary ?? ''} setBeneficiary={v => setValue('beneficiary', v)}
              />
            </div>
          ) : (
            <WebsiteSetupFields values={values} setValue={setValue} platformKey={platform.key} nameAuto={nameAuto} />
          )}
        </StepShell>
      )}

      {stepKey === 'review' && platform && (
        <StepShell
          title="Deploy Markee"
          sub="Review your info and sign the transaction to deploy your Markee on Base."
          onBack={() => go(-1)}
          onNext={busy ? undefined : handleDeploy}
          nextLabel={isPending ? 'Confirm in wallet…' : isConfirming ? 'Deploying…' : 'Deploy Markee'}
          nextDisabled={!isConnected || busy}
        >
          <ReviewSign
            platform={platform} values={values}
            selectedRepo={selectedRepo} selectedFile={selectedFile}
            isPending={isPending} isConfirming={isConfirming}
            error={txError ?? (writeError ? (writeError as Error).message : null)}
            isConnected={isConnected}
          />
        </StepShell>
      )}

      {stepKey === 'activate' && platform && newLeaderboardAddress && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(29,178,39,0.08)', border: `1px solid ${C.green}`, borderRadius: 14, padding: '20px 22px', marginBottom: 26 }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 99, background: 'rgba(29,178,39,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={22} color={C.green} strokeWidth={2.6} />
            </div>
            <div>
              <div style={{ color: C.text, fontWeight: 700 as const, fontSize: 17 }}>Transaction confirmed</div>
              <p style={{ color: C.text2, fontSize: 14, margin: '4px 0 0', lineHeight: 1.55 }}>
                Your {platform.name} Markee was deployed onchain.{' '}
                {hash && (
                  <a href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-jetbrains-mono)', color: C.blue, textDecoration: 'none', borderBottom: `1px dotted ${C.blue}` }}>
                    {hash.slice(0, 6)}…{hash.slice(-4)} ↗
                  </a>
                )}
              </p>
            </div>
          </div>

          <ActivationGuide platform={platform} leaderboardAddress={newLeaderboardAddress} selectedFile={selectedFile} />

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
