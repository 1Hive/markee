'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { BuyMessageModal } from '@/components/modals/BuyMessageModal'
import { StreamActivateModal } from '@/components/modals/StreamActivateModal'
import { STREAMING_FACTORY, STREAMING_ENABLED, CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { STRATEGIES, toPlatformTag, type Strategy, type Vertical } from '@/lib/strategy'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'

const C = {
  bg: '#060A2A', bg2: '#0A0F3D',
  pink: '#F897FE', blue: '#7C9CFF', green: '#1DB227',
  text: '#EDEEFF', text2: '#B8B6D9', muted: '#8A8FBF',
  border: 'rgba(138,143,191,0.2)', borderHover: 'rgba(248,151,254,0.4)',
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// (strategy x vertical) -> factory. Fixed price has a factory per vertical; streaming has one factory
// serving every vertical (the placement is a per-board platform tag), so all verticals map to it.
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

// The streaming factory serves every vertical, so it takes the placement as on-chain platform tags.
const STREAMING_FACTORY_ABI = [{
  inputs: [
    { name: '_beneficiaryAddress', type: 'address' },
    { name: '_leaderboardName', type: 'string' },
    { name: '_platformName', type: 'string' },
    { name: '_platformId', type: 'string' },
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

type StepKey = 'strategy' | 'setup' | 'review' | 'activate'

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

// ── Strategy preview card — styled after FeaturedCard in board-detail/shared.tsx ──
function StrategyPreviewCard({
  strategyKey, selected, disabled, onSelect,
}: {
  strategyKey: Strategy; selected: boolean; disabled?: boolean; onSelect: () => void
}) {
  const [hovering, setHovering] = useState(false)
  const meta    = STRATEGIES[strategyKey]
  const iconKey = meta.glyph === 'tag' ? 'tag' : 'zap'

  const sampleMsg   = strategyKey === 'fixed' ? 'FUND MY NEXT FEATURE →' : 'BUILDING ON BASE →'
  const sampleViews = strategyKey === 'fixed' ? '1.5K' : '892'
  const priceLabel  = strategyKey === 'fixed' ? '$5.00 Lump Sum' : '$5/mo. Stream'

  const active     = hovering && !disabled
  const isSelected = selected && !disabled

  // Gradient text: white → strategy accent, exactly like FeaturedCard
  const textGradient = `linear-gradient(120deg, ${C.text} 0%, ${meta.accent} 100%)`

  const borderColor = isSelected
    ? 'rgba(248,151,254,0.65)'
    : active
    ? 'rgba(248,151,254,0.4)'
    : 'rgba(255,255,255,0.18)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, paddingBottom: 20 }}>
      {/* Label + icon above */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <PlatGlyph icon={iconKey} color={meta.accent} size={17} />
        <span style={{ color: meta.accent, fontWeight: 700, fontSize: 14 }}>{meta.label}</span>
      </div>

      {/* Card — matches FeaturedCard layout & styling exactly */}
      <button
        onClick={disabled ? undefined : onSelect}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          position: 'relative' as const, width: '100%',
          textAlign: 'left' as const, cursor: disabled ? 'default' : 'pointer',
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${borderColor}`,
          borderRadius: 16, padding: '18px 26px 22px',
          backdropFilter: 'blur(4px)',
          opacity: disabled ? 0.55 : 1,
          boxShadow: isSelected
            ? `0 0 0 1px ${C.pink}55, 0 16px 44px rgba(6,10,42,0.55)`
            : active ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
          transform: active ? 'translateY(-2px)' : 'none',
          transition: 'border-color 180ms, transform 180ms, box-shadow 180ms',
          display: 'flex', flexDirection: 'column' as const,
        }}
      >
        {/* View count — top right, blue, small caps, matches FeaturedCard */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginBottom: 14, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: C.blue }}>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          {sampleViews}
        </div>

        {/* Message — gradient text, large, matches FeaturedCard exactly */}
        <div style={{
          fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700,
          fontSize: 'clamp(16px, 2.5vw, 28px)', lineHeight: 1.15, letterSpacing: '-0.02em',
          background: textGradient,
          WebkitBackgroundClip: 'text' as const, backgroundClip: 'text' as const,
          WebkitTextFillColor: 'transparent', userSelect: 'none' as const,
        }}>
          {sampleMsg}
        </div>

        {/* Attribution — bottom right italic, matches FeaturedCard */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
          <span>—</span><span>example.xyz</span>
        </div>

        {/* Price pill — floats up from bottom center on hover, matches FeaturedCard pillLabel */}
        <span style={{
          position: 'absolute' as const, bottom: -14, left: '50%',
          transform: `translateX(-50%) ${active ? 'translateY(0)' : 'translateY(4px)'}`,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: meta.accent, color: C.bg,
          fontFamily: 'var(--font-jetbrains-mono)', fontWeight: 700, fontSize: 12,
          padding: '6px 14px', borderRadius: 8, whiteSpace: 'nowrap' as const,
          boxShadow: `0 6px 22px ${meta.accent}66`,
          opacity: active ? 1 : 0,
          transition: 'opacity 180ms, transform 180ms',
          pointerEvents: 'none' as const, zIndex: 3,
        }}>
          <PlatGlyph icon={iconKey} color={C.bg} size={11} />{priceLabel}
        </span>

        {/* Coming soon badge */}
        {disabled && (
          <span style={{ position: 'absolute' as const, top: 12, right: 12, fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' as const, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 99, padding: '3px 9px' }}>Coming soon</span>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <div style={{ position: 'absolute' as const, top: 12, right: 12, width: 22, height: 22, borderRadius: 99, background: C.pink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={13} color={C.bg} strokeWidth={3} />
          </div>
        )}
      </button>

      {/* Tagline */}
      <p style={{ margin: 0, color: C.muted, fontSize: 12, lineHeight: 1.4 }}>{meta.tagline}</p>
    </div>
  )
}

// ── ChooseStrategy ──────────────────────────────────────────────────────────
function ChooseStrategy({ selected, onSelect }: { selected: Strategy | null; onSelect: (s: Strategy) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 8 }}>
      <StrategyPreviewCard strategyKey="fixed" selected={selected === 'fixed'} onSelect={() => onSelect('fixed')} />
      <StrategyPreviewCard strategyKey="streaming" selected={selected === 'streaming'} disabled={!STREAMING_ENABLED} onSelect={() => onSelect('streaming')} />
    </div>
  )
}

// ── Website setup ───────────────────────────────────────────────────────────
function WebsiteSetupFields({ values, setValue }: {
  values: Record<string, string>; setValue: (k: string, v: string) => void
}) {
  const mono = 'var(--font-jetbrains-mono)'
  const fieldBase: React.CSSProperties = { width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box' }
  const labelCss: React.CSSProperties = { display: 'block', fontFamily: mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }

  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
      <label style={{ display: 'block', marginBottom: 20 }}>
        <span style={labelCss}>Name this Markee</span>
        <input value={values.siteName ?? ''} onChange={e => setValue('siteName', e.target.value)} placeholder="My Project" style={fieldBase} />
      </label>
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


// ── Inner wizard (uses useSearchParams) ─────────────────────────────────────
function CreateWizardInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [step, setStep] = useState(0)
  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [streamActivateOpen, setStreamActivateOpen] = useState(false)
  const [values, setValuesRaw] = useState<Record<string, string>>({})
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // Restore activate step from URL (survives tab reload after clicking Basescan link).
  // Also handles ?strategy= deep-link for the strategy step.
  useEffect(() => {
    const deployed = searchParams.get('deployed')
    const strategyParam = searchParams.get('strategy') as Strategy | null
    if (deployed && /^0x[0-9a-fA-F]{40}$/.test(deployed)) {
      const s: Strategy = strategyParam === 'streaming' && STREAMING_ENABLED ? 'streaming' : 'fixed'
      setStrategy(s)
      setNewLeaderboardAddress(deployed)
      setStep(3) // 'activate' is always index 3 in ['strategy','setup','review','activate']
      return
    }
    if (strategyParam === 'streaming' && STREAMING_ENABLED) setStrategy('streaming')
    else if (strategyParam === 'fixed') setStrategy('fixed')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle confirmed tx
  useEffect(() => {
    if (!isSuccess || !receipt || !strategy) return
    const factoryAddr = FACTORIES[strategy]['openinternet'].toLowerCase()
    let found: string | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === factoryAddr && log.topics[1]) {
        found = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    if (!found) return
    setNewLeaderboardAddress(found)
    router.replace(`/create-a-markee?deployed=${found}&strategy=${strategy}`)
    if (strategy === 'streaming') {
      fetch('/api/streaming/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: found }),
      }).catch(() => {})
    }
    setStep(s => s + 1)
  }, [isSuccess, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (writeError) logTransactionError(writeError, 'CreateMarkeeWizard')
  }, [writeError])

  const setValue = (k: string, v: string) => setValuesRaw(prev => ({ ...prev, [k]: v }))

  const vInfo = VERTICALS.find(v => v.key === 'openinternet')!

  const stepKeys: StepKey[] = useMemo(() => {
    if (!strategy) return ['strategy']
    return ['strategy', 'setup', 'review', 'activate']
  }, [strategy])

  const stepKey = stepKeys[step] ?? 'strategy'

  const fieldsComplete = useMemo(() => {
    const b = /^0x[0-9a-fA-F]{40}$/.test(values.beneficiary ?? '')
    return !!(values.siteName?.trim() && b)
  }, [values])

  const go = (d: number) => setStep(s => Math.max(0, Math.min(s + d, stepKeys.length - 1)))

  const handleDeploy = () => {
    setTxError(null)
    if (!strategy) return
    if (chain?.id !== CANONICAL_CHAIN.id) {
      setTxError(`Wrong network. Switch your wallet to ${CANONICAL_CHAIN.name}, then deploy again.`)
      switchChain?.({ chainId: CANONICAL_CHAIN.id })
      return
    }
    const bene = values.beneficiary?.trim() ?? ''
    if (!/^0x[0-9a-fA-F]{40}$/.test(bene)) { setTxError('Enter a valid beneficiary address.'); return }
    const name = values.siteName?.trim() || 'My Markee'
    resetWrite()
    try {
      if (strategy === 'streaming') {
        const platformId = toPlatformTag(name, 'website')
        writeContract({
          address: STREAMING_FACTORY_ADDR,
          abi: STREAMING_FACTORY_ABI,
          functionName: 'createLeaderboard',
          args: [bene as `0x${string}`, name, 'website', platformId],
          chainId: CANONICAL_CHAIN.id,
        })
      } else {
        writeContract({
          address: FACTORIES['fixed']['openinternet'],
          abi: FACTORY_ABI,
          functionName: 'createLeaderboard',
          args: [bene as `0x${string}`, name],
          chainId: CANONICAL_CHAIN.id,
        })
      }
    } catch (err) {
      logTransactionError(err, 'CreateMarkeeWizard.createLeaderboard')
      setTxError(formatTransactionError(err))
    }
  }

  const busy = isPending || isConfirming

  return (
    <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 24px 80px' }}>
      <Link href="/raise-funding" style={{ color: C.muted, textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-jetbrains-mono)' }}>← Raise Funding</Link>
      <h1 style={{ margin: '14px 0 32px', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, letterSpacing: -1, color: C.text }}>
        {stepKey === 'strategy' ? 'Choose a pricing strategy' : 'Create a Markee'}
      </h1>

      {step >= 1 && (
        <Stepper steps={['Set up your Markee', 'Deploy Markee', 'Activate']} current={step - 1} />
      )}

      {stepKey === 'strategy' && (
        <StepShell
          onBack={() => router.back()} backLabel="Cancel" onNext={() => go(1)} nextDisabled={!strategy}
        >
          <ChooseStrategy selected={strategy} onSelect={setStrategy} />
        </StepShell>
      )}

      {stepKey === 'setup' && (
        <StepShell
          title="Set up your Markee"
          sub="Name your Markee and set a beneficiary address to receive funds."
          onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!fieldsComplete}
        >
          <WebsiteSetupFields values={values} setValue={setValue} />
        </StepShell>
      )}

      {stepKey === 'review' && strategy && (
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
            selectedRepo={null} selectedFile={null}
            isPending={isPending} isConfirming={isConfirming}
            error={txError ?? (writeError ? formatTransactionError(writeError) : null)}
            isConnected={isConnected}
          />
        </StepShell>
      )}

      {stepKey === 'activate' && strategy && newLeaderboardAddress && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'rgba(29,178,39,0.08)', border: `1px solid ${C.green}`, borderRadius: 14, padding: '20px 22px', marginBottom: 26 }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 99, background: 'rgba(29,178,39,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={22} color={C.green} strokeWidth={2.6} />
            </div>
            <div>
              <div style={{ color: C.text, fontWeight: 700 as const, fontSize: 17 }}>Transaction confirmed</div>
              <p style={{ color: C.text2, fontSize: 14, margin: '4px 0 0', lineHeight: 1.55 }}>
                Your Markee was deployed onchain.{' '}
                {hash && (
                  <a href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-jetbrains-mono)', color: C.blue, textDecoration: 'none', borderBottom: `1px dotted ${C.blue}` }}>
                    {hash.slice(0, 6)}…{hash.slice(-4)} ↗
                  </a>
                )}
              </p>
            </div>
          </div>

          <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '32px 28px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 22, fontWeight: 800 as const, color: C.text, marginBottom: 10 }}>Activate your Markee</div>
            <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.6, maxWidth: '40ch', margin: '0 auto 24px' }}>
              Buy the first message to activate your Markee.
            </p>
            <button
              onClick={() => strategy === 'streaming' ? setStreamActivateOpen(true) : setBuyModalOpen(true)}
              style={{ background: C.pink, color: C.bg, border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 15, fontWeight: 700 as const, cursor: 'pointer' }}
            >
              Activate Markee →
            </button>
            <div style={{ marginTop: 16 }}>
              <Link href={`/markee/${newLeaderboardAddress}`} style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>
                Skip for now →
              </Link>
            </div>
          </div>

          {/* Fixed-price activation */}
          <BuyMessageModal
            isOpen={buyModalOpen}
            onClose={() => setBuyModalOpen(false)}
            strategyAddress={newLeaderboardAddress as `0x${string}`}
            title="ACTIVATE MARKEE"
            messageLabel="SET FIRST MESSAGE"
            messagePlaceholder="Set the text your newly activated Markee will display..."
            ctaLabel="Activate Markee"
            onSuccess={() => router.push(`/markee/${newLeaderboardAddress}`)}
          />

          {/* Streaming activation: single modal handles create + approve + stream */}
          <StreamActivateModal
            isOpen={streamActivateOpen}
            board={newLeaderboardAddress as `0x${string}`}
            onClose={() => setStreamActivateOpen(false)}
            onSuccess={() => router.push(`/markee/${newLeaderboardAddress}`)}
            messageLabel="SET FIRST MESSAGE"
            messagePlaceholder="Set the text your newly activated Markee will display..."
          />
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
