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
import { STREAMING_FACTORY, STREAMING_ENABLED, CANONICAL_CHAIN, FACTORIES as V13_FACTORIES } from '@/lib/contracts/addresses'
import { STRATEGIES, toPlatformTag, type Strategy, type Vertical } from '@/lib/strategy'
import { StrategyBadge } from '@/components/StrategyBadge'
import { StrategyPreviewCard } from '@/components/StrategyPreviewCard'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'

const C = {
  bg: '#060A2A', bg2: '#0A0F3D',
  pink: '#F897FE', blue: '#7C9CFF', green: '#1DB227',
  text: '#EDEEFF', text2: '#B8B6D9', muted: '#8A8FBF',
  border: 'rgba(138,143,191,0.2)', borderHover: 'rgba(248,151,254,0.4)',
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const DEPLOYED_STORAGE_KEY = 'markee:create:deployed'

// (strategy x vertical) -> factory. Fixed price has a factory per vertical; streaming has one factory
// serving every vertical (the placement is a per-board platform tag), so all verticals map to it.
const STREAMING_FACTORY_ADDR = (STREAMING_FACTORY || ZERO_ADDRESS) as `0x${string}`
// Fixed price ("For Sale") now shares one vertical-agnostic factory too, same as streaming --
// FACTORIES.FOR_SALE in lib/contracts/addresses.ts, not the old per-vertical factories below (those
// stay defined only so existing boards created through them keep reading correctly elsewhere).
const FACTORIES: Record<Strategy, Record<Vertical, `0x${string}`>> = {
  fixed: {
    openinternet: V13_FACTORIES.FOR_SALE,
    github:       V13_FACTORIES.FOR_SALE,
    superfluid:   V13_FACTORIES.FOR_SALE,
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

type StepKey = 'setup' | 'review' | 'activate'

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 40 }}>
      {steps.map((label, i) => {
        const done = i < current, active = i === current
        return (
          <div key={i} style={{ display: 'contents' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 99, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700 as const, fontFamily: 'var(--font-jetbrains-mono)',
                background: done ? C.pink : active ? 'rgba(248,151,254,0.12)' : 'transparent',
                border: active ? `1.5px solid ${C.pink}` : done ? 'none' : `1px solid ${C.border}`,
                color: done ? C.bg : active ? C.pink : C.muted,
                boxShadow: active ? '0 0 0 5px rgba(248,151,254,0.08)' : 'none',
                transition: 'all 300ms',
              }}>
                {done ? <Check size={14} strokeWidth={2.8} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' as const, color: active ? C.pink : done ? C.text2 : C.muted, fontWeight: active ? 600 : 500 }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: i < current ? C.pink : C.border, marginTop: 18, minWidth: 16, transition: 'background 300ms' }} />
            )}
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

// ── ChooseStrategy ──────────────────────────────────────────────────────────
function ChooseStrategy({ selected, onSelect }: { selected: Strategy | null; onSelect: (s: Strategy) => void }) {
  const [strategyViews, setStrategyViews] = useState<{ fixed: number; streaming: number } | null>(null)

  useEffect(() => {
    fetch('/api/views/strategy-totals')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.fixed === 'number') setStrategyViews(d) })
      .catch(() => {})
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 28 }}>
      <StrategyPreviewCard strategyKey="fixed" selected={selected === 'fixed'} onSelect={() => onSelect('fixed')} viewCount={strategyViews?.fixed} />
      <StrategyPreviewCard strategyKey="streaming" selected={selected === 'streaming'} disabled={!STREAMING_ENABLED} onSelect={() => onSelect('streaming')} viewCount={strategyViews?.streaming} />
    </div>
  )
}

// ── Website setup ───────────────────────────────────────────────────────────
function WebsiteSetupFields({ values, setValue, touched }: {
  values: Record<string, string>; setValue: (k: string, v: string) => void; touched?: boolean
}) {
  const mono = 'var(--font-jetbrains-mono)'
  const nameOk = !!(values.siteName?.trim())
  const beneOk = /^0x[0-9a-fA-F]{40}$/.test(values.beneficiary ?? '')
  const errCss: React.CSSProperties = { fontFamily: mono, fontSize: 12, color: '#F87171', marginTop: 6 }
  const fieldBase: React.CSSProperties = { width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'Manrope, system-ui, sans-serif' }
  const labelCss: React.CSSProperties = { display: 'block', fontFamily: mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }

  return (
    <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 26 }}>
      <div style={{ marginBottom: 20 }}>
        <label>
          <span style={labelCss}>Name this Markee</span>
          <input value={values.siteName ?? ''} onChange={e => setValue('siteName', e.target.value)} placeholder="My Project" style={fieldBase} />
        </label>
        {touched && !nameOk && <p style={{ ...errCss, margin: '6px 0 0' }}>Markee name is required.</p>}
      </div>
      <div>
        <label>
          <span style={labelCss}>Beneficiary address</span>
          <input value={values.beneficiary ?? ''} onChange={e => setValue('beneficiary', e.target.value)} placeholder="0x... (receives ETH on Base Network)" style={{ ...fieldBase, fontFamily: mono }} />
        </label>
        {touched && !beneOk && <p style={{ ...errCss, margin: '6px 0 0' }}>Enter a valid 0x wallet address.</p>}
      </div>
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
  const rows: [string, React.ReactNode][] = [
    ['Pricing Strategy', <StrategyBadge key="strat" strategy={strategy} size="sm" />],
    ...(selectedRepo ? [['Repository', selectedRepo] as [string, React.ReactNode]] : []),
    ...(selectedFile ? [['File', selectedFile] as [string, React.ReactNode]] : []),
    ...(vertical.key === 'openinternet' && values.siteName ? [['Markee Name', values.siteName] as [string, React.ReactNode]] : []),
    ...(vertical.key === 'superfluid' && values.projectName ? [['Project name', values.projectName] as [string, React.ReactNode]] : []),
    ['Beneficiary Address', values.beneficiary ?? '-'],
  ]

  return (
    <div>
      <div style={{ background: 'rgba(10,15,61,0.4)', border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 18 }}>
        {rows.map(([k, v], i) => (
          <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>{k}</span>
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
  // Separate from useWriteContract's own `hash` -- that resets to undefined on any remount, so the
  // Basescan link needs its own state that the URL/sessionStorage restore path can populate too.
  const [deployedTxHash, setDeployedTxHash] = useState<`0x${string}` | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [setupTouched, setSetupTouched] = useState(false)

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // Restore activate step after clicking the Basescan tx link: normally that opens in a new tab and
  // leaves this one untouched, but some browsers/wallet in-app browsers don't honor target="_blank"
  // and navigate the same tab instead -- then the Basescan back button lands on whatever URL was in
  // history *before* this wizard's own router.replace() calls (replace doesn't add a back-able entry
  // per step), which can skip all the way back past this page's own progress. Restored from the URL
  // first; sessionStorage is a fallback for when that back-navigation also drops the query string.
  useEffect(() => {
    const deployed = searchParams.get('deployed')
    const strategyParam = searchParams.get('strategy') as Strategy | null
    const hashParam = searchParams.get('hash')
    if (deployed && /^0x[0-9a-fA-F]{40}$/.test(deployed)) {
      const s: Strategy = strategyParam === 'streaming' && STREAMING_ENABLED ? 'streaming' : 'fixed'
      setStrategy(s)
      setNewLeaderboardAddress(deployed)
      if (hashParam && /^0x[0-9a-fA-F]{64}$/.test(hashParam)) setDeployedTxHash(hashParam as `0x${string}`)
      setStep(2) // 'activate' is index 2 in ['setup','review','activate']
      return
    }
    try {
      const saved = sessionStorage.getItem(DEPLOYED_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { address?: string; strategy?: Strategy; hash?: string }
        if (parsed.address && /^0x[0-9a-fA-F]{40}$/.test(parsed.address)) {
          const s: Strategy = parsed.strategy === 'streaming' && STREAMING_ENABLED ? 'streaming' : 'fixed'
          setStrategy(s)
          setNewLeaderboardAddress(parsed.address)
          if (parsed.hash) setDeployedTxHash(parsed.hash as `0x${string}`)
          setStep(2)
          router.replace(`/create-a-markee?deployed=${parsed.address}&strategy=${s}${parsed.hash ? `&hash=${parsed.hash}` : ''}`)
          return
        }
      }
    } catch { /* ignore */ }
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
    if (hash) setDeployedTxHash(hash)
    const hashQuery = hash ? `&hash=${hash}` : ''
    router.replace(`/create-a-markee?deployed=${found}&strategy=${strategy}${hashQuery}`)
    try {
      sessionStorage.setItem(DEPLOYED_STORAGE_KEY, JSON.stringify({ address: found, strategy, hash: hash ?? null }))
    } catch { /* ignore */ }
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

  const clearDeployedStorage = () => { try { sessionStorage.removeItem(DEPLOYED_STORAGE_KEY) } catch { /* ignore */ } }

  const setValue = (k: string, v: string) => setValuesRaw(prev => ({ ...prev, [k]: v }))

  const vInfo = VERTICALS.find(v => v.key === 'openinternet')!

  const stepKeys: StepKey[] = ['setup', 'review', 'activate']

  const stepKey = stepKeys[step] ?? 'setup'

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
      {stepKey === 'setup' && (
        <button
          onClick={() => router.back()}
          style={{ background: 'transparent', border: 'none', padding: 0, color: C.muted, textDecoration: 'none', fontSize: 13, fontFamily: 'var(--font-jetbrains-mono)', cursor: 'pointer' }}
        >
          ← Back
        </button>
      )}
      <h1 style={{ margin: '14px 0 32px', fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, letterSpacing: -1, color: C.text }}>
        Create a Markee
      </h1>

      <Stepper steps={['Set up your Markee', 'Deploy Markee', 'Activate']} current={step} />

      {stepKey === 'setup' && (
        <StepShell
          onBack={() => router.back()} backLabel="Cancel"
          onNext={() => {
            setSetupTouched(true)
            if (strategy && fieldsComplete) go(1)
          }}
        >
          <WebsiteSetupFields values={values} setValue={setValue} touched={setupTouched} />
          <h2 style={{ margin: '28px 0 20px', fontSize: 20, fontWeight: 700, color: C.text }}>Choose Pricing Strategy</h2>
          <ChooseStrategy selected={strategy} onSelect={s => { setStrategy(s); setSetupTouched(false) }} />
          {setupTouched && !strategy && (
            <p style={{ margin: '-16px 0 24px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#F87171' }}>Please select a pricing strategy.</p>
          )}
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
                {(deployedTxHash ?? hash) && (
                  <a href={`https://basescan.org/tx/${deployedTxHash ?? hash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-jetbrains-mono)', color: C.blue, textDecoration: 'none', borderBottom: `1px dotted ${C.blue}` }}>
                    {(deployedTxHash ?? hash)!.slice(0, 6)}…{(deployedTxHash ?? hash)!.slice(-4)} ↗
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
              <Link href="/account" onClick={clearDeployedStorage} style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>
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
            messagePlaceholder="Your message here..."
            ctaLabel="Activate Markee"
            onSuccess={() => { clearDeployedStorage(); router.push(`/markee/${newLeaderboardAddress}`) }}
          />

          {/* Streaming activation: single modal handles create + approve + stream */}
          <StreamActivateModal
            isOpen={streamActivateOpen}
            board={newLeaderboardAddress as `0x${string}`}
            onClose={() => setStreamActivateOpen(false)}
            onSuccess={() => { clearDeployedStorage(); router.push(`/markee/${newLeaderboardAddress}`) }}
            messageLabel="SET FIRST MESSAGE"
            messagePlaceholder="Your message here..."
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
      <Header activePage="raise" />
      <Suspense>
        <CreateWizardInner />
      </Suspense>
    </div>
  )
}
