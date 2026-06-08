'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { CheckCircle2, AlertCircle, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'

// ── Color tokens + fonts ──────────────────────────────────────────────────────
const C = {
  bg: '#060A2A',
  bg2: '#0A0F3D',
  text: '#EDEEFF',
  text2: '#B8B6D9',
  muted: '#8A8FBF',
  pink: '#F897FE',
  blue: '#7C9CFF',
  green: '#1DB227',
  border: 'rgba(138,143,191,0.2)',
  borderHover: 'rgba(248,151,254,0.35)',
}
const MONO = "'JetBrains Mono', monospace"
const SANS = 'Manrope, system-ui, sans-serif'

// ── Factory ABI (same signature for all three platforms) ─────────────────────
const FACTORY_ABI = [
  {
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
  },
] as const

// ── Platform definitions ──────────────────────────────────────────────────────
type PlatformKey = 'openinternet' | 'github' | 'superfluid'

interface FieldDef {
  id: string
  label: string
  placeholder: string
  type: 'text' | 'url' | 'wallet'
}

interface Platform {
  key: PlatformKey
  name: string
  tagline: string
  iconColor: string
  summary: string
  steps: string[]
  fields: FieldDef[]
  requiresGitHub: boolean
  factoryAddress: `0x${string}`
  activationPath: (addr: string) => string
}

const PLATFORMS: Platform[] = [
  {
    key: 'openinternet',
    name: 'Website',
    tagline: 'Any site you own',
    iconColor: C.pink,
    summary: 'Add a Markee sign to any website you manage with a highly flexible LLM-guided integration.',
    steps: ['Set up your Markee', 'Deploy Markee', 'Embed & Activate'],
    fields: [
      { id: 'siteUrl', label: 'Site URL', placeholder: 'https://myproject.xyz', type: 'url' },
      { id: 'siteName', label: 'Site name', placeholder: 'My Project', type: 'text' },
      { id: 'beneficiary', label: 'Beneficiary address', placeholder: '0x… (receives ETH on Base)', type: 'wallet' },
    ],
    requiresGitHub: false,
    factoryAddress: '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c',
    activationPath: (addr) => `/ecosystem/website/${addr}`,
  },
  {
    key: 'github',
    name: 'GitHub Repo',
    tagline: 'README, docs, any markdown',
    iconColor: C.text,
    summary: 'Drop a Markee sign into any markdown file in your repo. Perfect for READMEs and docs.',
    steps: ['Connect GitHub', 'Set up your Markee', 'Deploy Markee', 'Embed & Activate'],
    fields: [
      { id: 'beneficiary', label: 'Beneficiary address', placeholder: '0x… (receives ETH on Base)', type: 'wallet' },
    ],
    requiresGitHub: true,
    factoryAddress: '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2',
    activationPath: (addr) => `/ecosystem/platforms/github/${addr}`,
  },
  {
    key: 'superfluid',
    name: 'Superfluid Project',
    tagline: 'Earn SUP incentives',
    iconColor: C.green,
    summary: 'Create a Markee sign for your Superfluid project and earn SUP rewards for every message bought.',
    steps: ['Set up your Markee', 'Deploy Markee', 'Activate'],
    fields: [
      { id: 'projectName', label: 'Superfluid project name', placeholder: 'My Stream', type: 'text' },
      { id: 'beneficiary', label: 'Beneficiary address', placeholder: '0x… (receives ETH on Base)', type: 'wallet' },
    ],
    requiresGitHub: false,
    factoryAddress: '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad',
    activationPath: (addr) => `/ecosystem/platforms/superfluid/${addr}`,
  },
]

function platformByKey(k: string | null): Platform | null {
  return PLATFORMS.find(p => p.key === k) ?? null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveSiteName(url: string): string {
  if (!url) return ''
  const host = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0]
  const root = (host || '').split('.')[0]
  if (!root) return ''
  return root.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

// ── PlatGlyph ─────────────────────────────────────────────────────────────────
function PlatGlyph({ icon, size = 24, color }: { icon: string; size?: number; color: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (icon === 'globe') return <svg {...common}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  if (icon === 'github') return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
  if (icon === 'zap') return <svg {...common}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>
}

// ── CopyBlock ─────────────────────────────────────────────────────────────────
function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    try { navigator.clipboard.writeText(code) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{ position: 'relative', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 52px 14px 16px', marginTop: 12 }}>
      <pre style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, color: C.text2, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.65 }}>{code}</pre>
      <button onClick={copy} style={{ position: 'absolute', top: 10, right: 10, background: copied ? C.green : C.bg2, color: copied ? C.bg : C.text2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ── ActivateCard ──────────────────────────────────────────────────────────────
function ActivateCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, background: C.pink, color: C.bg, fontFamily: MONO, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{title}</div>
      </div>
      <div style={{ paddingLeft: 38 }}>{children}</div>
    </div>
  )
}

function githubDelimiter(slug: string) {
  return `<!-- MARKEE:start ${slug} -->\n<!-- MARKEE:end -->`
}

function embedInstructions(platform: Platform, slug: string, file?: string | null) {
  if (platform.key === 'github') {
    return `Please add a Markee sign to ${file || 'the markdown file'} in my repository.\n\nInsert these delimiter comments where the sign should render, then commit the change:\n\n<!-- MARKEE:start ${slug} -->\n<!-- MARKEE:end -->`
  }
  return `Please add a Markee sign to my website.\n\nInsert this snippet where the sign should appear, then commit and deploy:\n\n<div data-markee="${slug}"></div>\n<script src="https://markee.xyz/embed.js" async></script>`
}

// ── ActivationGuide ───────────────────────────────────────────────────────────
function ActivationGuide({ platform, slug, file, activationPath }: { platform: Platform; slug: string; file?: string | null; activationPath: string }) {
  const [verified, setVerified] = useState(false)
  const isGithub = platform.key === 'github'
  const showEmbed = platform.key !== 'superfluid'
  const copy = { color: C.text2, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' } as const
  const center = { display: 'flex', justifyContent: 'center' }
  const confirmedTag = (label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 600, fontSize: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: C.green, boxShadow: `0 0 8px ${C.green}` }} /> {label}
    </span>
  )
  let n = 1
  return (
    <div>
      {showEmbed && (
        <ActivateCard n={n++} title={isGithub ? 'Embed in your markdown file' : 'Embed on your site'}>
          <p style={{ ...copy, margin: 0 }}>
            {isGithub
              ? 'Copy and paste the snippet into your markdown file and commit changes.'
              : 'Copy and paste these instructions to an LLM with access to your repository.'}
          </p>
          <CopyBlock code={isGithub ? githubDelimiter(slug) : embedInstructions(platform, slug, file)} />
        </ActivateCard>
      )}
      {showEmbed && (
        <ActivateCard n={n++} title={isGithub ? 'Verify integration' : 'Verify Integration'}>
          <p style={copy}>{isGithub ? 'Click to confirm once your update is committed.' : 'Click to confirm once your integration is complete.'}</p>
          <div style={center}>
            {verified ? confirmedTag('Integration confirmed') : (
              <button onClick={() => setVerified(true)} style={{ background: C.pink, color: C.bg, border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: SANS, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {isGithub ? 'Check Integration' : 'Confirm Integration'}
              </button>
            )}
          </div>
        </ActivateCard>
      )}
      <ActivateCard n={n++} title="Activate your Markee">
        <p style={copy}>Buy the first message to activate your Markee.</p>
        <div style={center}>
          <Link href={activationPath} style={{ background: C.pink, color: C.bg, borderRadius: 8, padding: '12px 22px', fontFamily: SANS, fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>
            Buy a message →
          </Link>
        </div>
      </ActivateCard>
    </div>
  )
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
      {steps.map((label, i) => {
        const done = i < current, active = i === current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 12, fontWeight: 700, background: done ? C.pink : 'transparent', border: active ? `1px solid ${C.pink}` : done ? 'none' : `1px solid ${C.border}`, color: done ? C.bg : active ? C.pink : C.muted }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 13, color: active ? C.text : done ? C.text2 : C.muted, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, minWidth: 18, height: 1, background: C.border, margin: '0 14px' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Button primitives ─────────────────────────────────────────────────────────
function PrimaryBtn({ onClick, disabled, children, style }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: disabled ? 'rgba(248,151,254,0.3)' : C.pink, color: C.bg, border: 'none', borderRadius: 8, padding: '12px 22px', fontFamily: SANS, fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', ...style }}>
      {children}
    </button>
  )
}
function GhostBtn({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 22px', fontFamily: SANS, fontWeight: 600, fontSize: 14, color: C.text2, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

// ── StepShell ─────────────────────────────────────────────────────────────────
function StepShell({ title, sub, children, onBack, onNext, nextLabel, nextDisabled, backLabel }: {
  title?: string; sub?: string; children: React.ReactNode; onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; backLabel?: string
}) {
  return (
    <div>
      {title && <h2 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, letterSpacing: -0.6, color: C.text }}>{title}</h2>}
      {sub && <p style={{ margin: '0 0 28px', color: C.text2, fontSize: 15, lineHeight: 1.55, maxWidth: '56ch' }}>{sub}</p>}
      {children}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
        <GhostBtn onClick={onBack}>{backLabel ?? '← Back'}</GhostBtn>
        {onNext && <PrimaryBtn onClick={onNext} disabled={nextDisabled}>{nextLabel ?? 'Continue'}</PrimaryBtn>}
      </div>
    </div>
  )
}

// ── ChoosePlatform ────────────────────────────────────────────────────────────
function ChoosePlatform({ selected, onSelect }: { selected: PlatformKey | null; onSelect: (k: PlatformKey) => void }) {
  const icons: Record<string, string> = { openinternet: 'globe', github: 'github', superfluid: 'zap' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
      {PLATFORMS.map(p => {
        const on = selected === p.key
        return (
          <button key={p.key} onClick={() => onSelect(p.key)} style={{ textAlign: 'left', cursor: 'pointer', background: on ? 'rgba(248,151,254,0.06)' : 'rgba(10,15,61,0.5)', border: `1px solid ${on ? C.borderHover : C.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color 160ms, background 160ms' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PlatGlyph icon={icons[p.key]} color={p.iconColor} size={24} />
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

// ── ConnectGitHub ─────────────────────────────────────────────────────────────
interface GhUser { login: string; avatarUrl: string }

function ConnectGitHub({ user, onRefresh }: { user: GhUser | null; onRefresh: () => void }) {
  return (
    <div style={{ background: 'rgba(10,15,61,0.5)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, textAlign: 'center', marginBottom: 28 }}>
      <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlatGlyph icon="github" color={C.text} size={28} />
      </div>
      {user ? (
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.green, fontWeight: 600, fontSize: 15 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
            Connected as <span style={{ fontFamily: MONO }}>@{user.login}</span>
          </div>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>You can now pick a repository and file.</p>
        </div>
      ) : (
        <div>
          <p style={{ color: C.text2, fontSize: 15, margin: '0 0 20px', lineHeight: 1.55, maxWidth: '40ch', marginLeft: 'auto', marginRight: 'auto' }}>Connect your GitHub account so we can add the Markee delimiter to a markdown file and confirm it via the GitHub API.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/api/github/connect?returnTo=wizard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.text, color: C.bg, borderRadius: 8, padding: '12px 22px', fontFamily: SANS, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              <PlatGlyph icon="github" color={C.bg} size={18} /> Connect GitHub
            </a>
            <button onClick={onRefresh} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', color: C.text2, fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PickRepo ──────────────────────────────────────────────────────────────────
interface Repo { full_name: string; name: string }

function PickRepo({ repos, files, selectedRepo, selectedFile, onSelectRepo, onSelectFile }: {
  repos: Repo[]; files: string[]; selectedRepo: string | null; selectedFile: string | null; onSelectRepo: (r: string) => void; onSelectFile: (f: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginBottom: 24 }}>
      <div>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 10 }}>Repository</span>
        {repos.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13 }}>No repos found. Make sure the GitHub App has access.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {repos.slice(0, 20).map(r => (
              <button key={r.full_name} onClick={() => onSelectRepo(r.full_name)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: selectedRepo === r.full_name ? 'rgba(248,151,254,0.06)' : C.bg, border: `1px solid ${selectedRepo === r.full_name ? C.borderHover : C.border}`, borderRadius: 8, padding: '12px 14px', color: C.text, fontFamily: MONO, fontSize: 14 }}>
                <PlatGlyph icon="github" color={C.muted} size={16} /> {r.full_name}
              </button>
            ))}
          </div>
        )}
      </div>
      {files.length > 0 && (
        <div>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 10 }}>Markdown file</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map(f => (
              <button key={f} onClick={() => onSelectFile(f)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: selectedFile === f ? 'rgba(248,151,254,0.06)' : C.bg, border: `1px solid ${selectedFile === f ? C.borderHover : C.border}`, borderRadius: 8, padding: '12px 14px', color: C.text, fontFamily: MONO, fontSize: 14 }}>
                <span style={{ color: C.muted }}>📄</span> {f}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SetupFields ───────────────────────────────────────────────────────────────
function SetupFields({ platform, values, setValue, hints }: { platform: Platform; values: Record<string, string>; setValue: (k: string, v: string) => void; hints?: Record<string, string | null> }) {
  const baseStyle = { width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' as const }
  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26, marginBottom: 4 }}>
      {platform.fields.map(f => (
        <label key={f.id} style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>{f.label}</span>
          <input value={values[f.id] ?? ''} onChange={e => setValue(f.id, e.target.value)} placeholder={f.placeholder} style={{ ...baseStyle, fontFamily: f.type === 'wallet' ? MONO : 'inherit' }} />
          {hints?.[f.id] && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontFamily: MONO, fontSize: 11, color: C.blue, letterSpacing: 0.3 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
              {hints[f.id]}
            </span>
          )}
        </label>
      ))}
    </div>
  )
}

// ── ReviewSign ────────────────────────────────────────────────────────────────
function ReviewSign({ platform, values, repo, file, deploying }: { platform: Platform; values: Record<string, string>; repo: string | null; file: string | null; deploying: boolean }) {
  const rows: [string, string][] = [
    ['Integration platform', platform.name],
    ...(repo ? [['Repository', repo] as [string, string]] : []),
    ...(file ? [['File', file] as [string, string]] : []),
    ...platform.fields.map(f => [f.label, values[f.id] || '–'] as [string, string]),
  ]
  return (
    <div>
      <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 18 }}>
        {rows.map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
            <span style={{ color: C.text, fontSize: 14, fontFamily: MONO, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}>
        <span style={{ color: C.text2, fontSize: 14 }}>Network fee (est.)</span>
        <span style={{ color: C.text, fontFamily: MONO, fontSize: 14 }}>~$2.40</span>
      </div>
      {deploying && (
        <div style={{ marginTop: 16, textAlign: 'center', color: C.pink, fontFamily: MONO, fontSize: 13 }}>Confirm in your wallet…</div>
      )}
    </div>
  )
}

// ── ActivateStep ──────────────────────────────────────────────────────────────
function ActivateStep({ platform, values, file, newAddress, txHash }: { platform: Platform; values: Record<string, string>; file: string | null; newAddress: string; txHash: string }) {
  const slug = ((values.siteName || values.projectName || newAddress).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || newAddress.slice(2, 10)
  const activationPath = platform.activationPath(newAddress)
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(29,178,39,0.08)', border: `1px solid ${C.green}`, borderRadius: 14, padding: '20px 22px', marginBottom: 26 }}>
        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 99, background: 'rgba(29,178,39,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={22} color={C.green} />
        </div>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>Transaction confirmed</div>
          <p style={{ color: C.text2, fontSize: 14, margin: '4px 0 0', lineHeight: 1.55 }}>
            Your {platform.name} Markee was deployed onchain.{' '}
            <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, color: C.blue, textDecoration: 'none', borderBottom: `1px dotted ${C.blue}` }}>
              {txHash.slice(0, 6)}…{txHash.slice(-4)} ↗
            </a>
          </p>
        </div>
      </div>

      <ActivationGuide platform={platform} slug={slug} file={file} activationPath={activationPath} />

      <div style={{ marginTop: 14, paddingTop: 24, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
        <Link href="/account" style={{ background: C.pink, color: C.bg, borderRadius: 8, padding: '12px 22px', fontFamily: SANS, fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-block' }}>
          Go to my dashboard →
        </Link>
      </div>
    </div>
  )
}

// ── CreateWizard ──────────────────────────────────────────────────────────────
function CreateWizard() {
  const searchParams = useSearchParams()
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [platformKey, setPlatformKey] = useState<PlatformKey | null>(null)
  const [step, setStep] = useState(0)
  const [ghUser, setGhUser] = useState<GhUser | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [repoFiles, setRepoFiles] = useState<string[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [nameTouched, setNameTouched] = useState(false)
  const [newAddress, setNewAddress] = useState<string | null>(null)
  const [newTxHash, setNewTxHash] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)

  const platform = platformKey ? platformByKey(platformKey) : null

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })
  const deploying = isPending || isConfirming

  // Deep-link ?platform=
  useEffect(() => {
    const p = searchParams.get('platform')
    if (p && platformByKey(p)) { setPlatformKey(p as PlatformKey); setStep(1) }
  }, [searchParams])

  // Auto-fill site name from URL (website platform only)
  useEffect(() => {
    if (platformKey !== 'openinternet' || nameTouched) return
    const derived = deriveSiteName(values.siteUrl ?? '')
    if (derived && derived !== values.siteName) setValues(prev => ({ ...prev, siteName: derived }))
  }, [values.siteUrl, platformKey, nameTouched])

  // Fetch GitHub user status
  const checkGhUser = () => {
    fetch('/api/github/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.connected) setGhUser({ login: data.login, avatarUrl: data.avatarUrl })
      else setGhUser(null)
    }).catch(() => {})
  }

  useEffect(() => {
    if (platformKey === 'github') checkGhUser()
  }, [platformKey])

  // Fetch repos when GitHub is connected
  useEffect(() => {
    if (platformKey !== 'github' || !ghUser) return
    fetch('/api/github/my-repos').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.repos) setRepos(data.repos)
    }).catch(() => {})
  }, [ghUser, platformKey])

  // Fetch files when repo is selected
  useEffect(() => {
    if (!selectedRepo) { setRepoFiles([]); return }
    fetch(`/api/github/repo-files?repo=${encodeURIComponent(selectedRepo)}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.files) setRepoFiles(data.files)
    }).catch(() => {})
  }, [selectedRepo])

  // Parse new address from receipt logs
  useEffect(() => {
    if (!isSuccess || !receipt || !platform) return
    let found: string | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === platform.factoryAddress.toLowerCase() && log.topics[1]) {
        found = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    setNewAddress(found)
    setNewTxHash(receipt.transactionHash)
    setStep(prev => prev + 1)
  }, [isSuccess, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (k: string, v: string) => {
    if (k === 'siteName') setNameTouched(true)
    setValues(prev => ({ ...prev, [k]: v }))
  }

  const stepKeys = useMemo(() => {
    if (!platform) return ['choose']
    return platform.requiresGitHub
      ? ['choose', 'connect', 'setup', 'review', 'activate']
      : ['choose', 'setup', 'review', 'activate']
  }, [platform])

  const stepKey = stepKeys[step] ?? 'choose'
  const stepperLabels = platform?.steps ?? []
  const stepperCurrent = Math.min(step - 1, stepperLabels.length - 1)

  const fieldsComplete = platform
    ? platform.fields.every(f => (values[f.id] ?? '').trim()) &&
      (platform.key !== 'github' || (selectedRepo && selectedFile))
    : false

  const go = (d: number) => setStep(s => Math.max(0, s + d))

  const handleDeploy = () => {
    if (!platform || !isConnected || !isCorrectChain) return
    const beneficiary = values.beneficiary?.trim()
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setDeployError('Enter a valid beneficiary address.')
      return
    }
    const name = (values.siteName || values.projectName || selectedRepo?.split('/')[1] || '').trim()
    if (!name) { setDeployError('Enter a name for your Markee.'); return }
    setDeployError(null)
    resetWrite()
    writeContract({
      address: platform.factoryAddress,
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [beneficiary as `0x${string}`, name],
      chainId: CANONICAL_CHAIN.id,
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: SANS }}>
      <Header activePage="raise" />
      <div style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link href="/raise-funding" style={{ color: C.muted, textDecoration: 'none', fontSize: 13, fontFamily: MONO }}>← Raise Funding</Link>
        <h1 style={{ margin: '14px 0 4px', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, letterSpacing: -1, color: C.text }}>
          {step === 0 ? 'Choose a Platform' : 'Create a Markee'}
        </h1>

        {step > 0 && platform && (
          <div style={{ marginTop: 32 }}>
            <Stepper steps={stepperLabels} current={stepperCurrent} />
          </div>
        )}

        {/* Step: Choose */}
        {stepKey === 'choose' && (
          <StepShell onBack={() => history.back()} backLabel="Cancel" onNext={() => go(1)} nextDisabled={!platformKey}>
            <ChoosePlatform selected={platformKey} onSelect={k => { setPlatformKey(k); setStep(0) }} />
          </StepShell>
        )}

        {/* Step: Connect GitHub */}
        {stepKey === 'connect' && (
          <StepShell title="Connect GitHub" sub="We use your connection to add the Markee delimiter and confirm it via the GitHub API." onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!ghUser}>
            <ConnectGitHub user={ghUser} onRefresh={checkGhUser} />
          </StepShell>
        )}

        {/* Step: Setup */}
        {stepKey === 'setup' && platform && (
          <StepShell title="Set up your Markee" sub="Set the domain where your Markee will live and an address to receive funds." onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!fieldsComplete}>
            {platform.key === 'github' && (
              <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26, marginBottom: 16 }}>
                <PickRepo repos={repos} files={repoFiles} selectedRepo={selectedRepo} selectedFile={selectedFile} onSelectRepo={r => { setSelectedRepo(r); setSelectedFile(null) }} onSelectFile={setSelectedFile} />
              </div>
            )}
            <SetupFields platform={platform} values={values} setValue={setValue} hints={{ siteName: (!nameTouched && platformKey === 'openinternet' && values.siteName) ? 'Pulled from site metadata' : null }} />
          </StepShell>
        )}

        {/* Step: Review + Deploy */}
        {stepKey === 'review' && platform && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, letterSpacing: -0.6, color: C.text }}>Deploy Markee</h2>
            <p style={{ margin: '0 0 28px', color: C.text2, fontSize: 15, lineHeight: 1.55 }}>Review your info and connect a wallet to deploy your Markee.</p>
            <ReviewSign platform={platform} values={values} repo={selectedRepo} file={selectedFile} deploying={deploying} />

            {!isConnected && (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                <p style={{ color: C.text2, fontSize: 14 }}>Connect your wallet to deploy.</p>
                <ConnectButton />
              </div>
            )}
            {isConnected && !isCorrectChain && (
              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertCircle size={16} color="#f87171" />
                <span style={{ color: '#f87171', fontSize: 14 }}>Switch to {CANONICAL_CHAIN.name}</span>
                <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFA94D', color: C.bg, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: SANS, fontWeight: 600, fontSize: 13 }}>
                  <ArrowRightLeft size={14} /> Switch
                </button>
              </div>
            )}

            {(deployError || writeError) && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, color: '#f87171', fontSize: 14 }}>
                <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{deployError ?? writeError?.message}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
              <GhostBtn onClick={() => go(-1)}>← Back</GhostBtn>
              {isConnected && isCorrectChain && (
                <PrimaryBtn onClick={handleDeploy} disabled={deploying}>
                  {deploying ? (isPending ? 'Awaiting signature…' : 'Confirming…') : 'Deploy Markee'}
                </PrimaryBtn>
              )}
            </div>
          </div>
        )}

        {/* Step: Activate */}
        {stepKey === 'activate' && platform && newAddress && newTxHash && (
          <ActivateStep platform={platform} values={values} file={selectedFile} newAddress={newAddress} txHash={newTxHash} />
        )}
      </div>
      <Footer />
    </div>
  )
}

export default function CreateAMarkeePage() {
  return <CreateWizard />
}
