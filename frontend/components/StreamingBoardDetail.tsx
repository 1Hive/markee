'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, Zap, Trophy, Plus, Copy, Check } from 'lucide-react'
import {
  formatEther, decodeEventLog, type Address,
} from 'viem'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain,
} from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { StreamModal, type StreamTarget } from '@/components/modals/StreamModal'
import { useStreamingMarkees, type StreamingMarkee } from '@/lib/contracts/useStreamingMarkees'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { ratePerSecToMonthly } from '@/lib/superfluid/streaming'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { NETWORK_PAUSED } from '@/lib/paused'

// ── Theme tokens (shared with StreamModal) ─────────────────────────────────────
const BG = '#060A2A'
const BG2 = '#0A0F3D'
const PINK = '#F897FE'
const BORDER = 'rgba(138,143,191,0.2)'
const MUTED = '#8A8FBF'
const TEXT = '#EDEEFF'
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"

const MARKEE_CREATED_ABI = [
  {
    type: 'event',
    name: 'MarkeeCreated',
    inputs: [
      { name: 'markeeAddress', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'message', type: 'string', indexed: false },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
] as const

// Effective rate (wei/sec) → human "X ETH/mo".
function formatRate(weiPerSec: bigint): string {
  const eth = parseFloat(formatEther(ratePerSecToMonthly(weiPerSec)))
  if (eth === 0) return '0 ETH/mo'
  if (eth < 0.00005) return '< 0.0001 ETH/mo' // would round to 0.0000 at 4 dp
  return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
}

function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`bg-[#1A1F4D] rounded animate-pulse ${className}`} />
}

function MarkeeRowSkeleton() {
  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 px-5 py-4 flex items-start gap-4">
      <SkeletonBar className="flex-shrink-0 w-8 h-8 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        <SkeletonBar className="h-4 w-4/5" />
        <SkeletonBar className="h-3 w-24" />
      </div>
      <SkeletonBar className="w-24 h-4" />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function StreamingBoardDetail({ board }: { board: Address }) {
  const { meta, markees, isLoading, refetch } = useStreamingMarkees(board)

  const [target, setTarget] = useState<StreamTarget | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const canStream = !NETWORK_PAUSED && meta.version !== undefined

  const messageCount = meta.markeeCount !== undefined
    ? (meta.markeeCount > 0n ? meta.markeeCount - 1n : 0n)
    : undefined

  const topMarkee = markees[0]

  const copyAddress = () => {
    navigator.clipboard.writeText(board)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const backMarkee = (m: StreamingMarkee) =>
    setTarget({ address: m.address, message: m.message, name: m.name })

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="create-a-markee" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Link href="/create-a-markee" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Create a Markee</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#8A8FBF]">Streaming</span>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            {isLoading && !meta.name
              ? <SkeletonBar className="w-32 h-3.5" />
              : <span className="text-[#EDEEFF] truncate max-w-xs">{meta.name ?? ''}</span>
            }
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-16 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Zap size={28} className="text-[#1DB227]" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  {isLoading && !meta.name
                    ? <SkeletonBar className="w-48 h-7" />
                    : (
                      <>
                        <h1 className="text-2xl font-bold text-[#EDEEFF]">{meta.name ?? ''}</h1>
                        <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          Streaming
                        </span>
                      </>
                    )
                  }
                </div>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-mono transition-colors"
                >
                  {board.slice(0, 8)}…{board.slice(-6)}
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            {canStream && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
              >
                <Plus size={18} />
                Add a message
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-8 mt-8">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{messageCount?.toString() ?? '—'}</span>
              <span className="text-[#8A8FBF]">messages</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trophy size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">
                {topMarkee ? formatRate(topMarkee.rate) : '—'}
              </span>
              <span className="text-[#8A8FBF]">top rate</span>
            </div>
          </div>
        </div>
      </section>

      {/* Top message spotlight */}
      {topMarkee && (
        <section className="bg-[#0A0F3D] border-y border-[#8A8FBF]/20 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#FFD700]/15 border border-[#FFD700]/40 text-[#FFD700] text-xs font-bold">
                #1
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">Top Message</div>
                <p className="text-[#EDEEFF] font-mono text-base leading-relaxed">
                  {topMarkee.message || <span className="opacity-40 italic">No message set</span>}
                </p>
                <div className="flex items-center gap-4 mt-3">
                  {topMarkee.name && <span className="text-[#8A8FBF] text-xs">by {topMarkee.name}</span>}
                  <span className="text-[#F897FE] text-xs font-semibold">{formatRate(topMarkee.rate)}</span>
                  {canStream && (
                    <button
                      onClick={() => backMarkee(topMarkee)}
                      className="text-[#7C9CFF] text-xs hover:text-[#F897FE] transition-colors"
                    >
                      Stream to back →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* All Messages */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#EDEEFF]">Leaderboard</h2>
            {canStream && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 text-sm text-[#8A8FBF] hover:text-[#F897FE] transition-colors border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-4 py-2 rounded-lg"
              >
                <Plus size={14} />
                Add a message
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <MarkeeRowSkeleton key={i} />)}
            </div>
          ) : markees.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Trophy size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No backed messages yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Add a message and open a stream to claim the top spot.</p>
              {canStream && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
                >
                  <Plus size={18} />
                  Add the first message
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {markees.map((markee, idx) => (
                <MarkeeRow
                  key={markee.address}
                  markee={markee}
                  rank={idx + 1}
                  onBack={canStream ? () => backMarkee(markee) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {target && (
        <StreamModal
          isOpen={true}
          board={board}
          markee={target}
          onClose={() => setTarget(null)}
          onSuccess={refetch}
        />
      )}

      {createOpen && (
        <CreateMessageModal
          board={board}
          onClose={() => setCreateOpen(false)}
          onCreated={(addr, message, name) => {
            setCreateOpen(false)
            refetch()
            setTarget({ address: addr, message, name })
          }}
        />
      )}
    </div>
  )
}

// ── Markee row ─────────────────────────────────────────────────────────────────

function MarkeeRow({
  markee,
  rank,
  onBack,
}: {
  markee: StreamingMarkee
  rank: number
  onBack?: () => void
}) {
  const { address } = useAccount()
  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  const rankColors: Record<number, string> = {
    1: 'text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10',
    2: 'text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10',
    3: 'text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10',
  }
  const rankStyle = rankColors[rank] ?? 'text-[#8A8FBF] border-[#8A8FBF]/20 bg-[#8A8FBF]/5'

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-all px-5 py-4 flex items-start gap-4">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${rankStyle}`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#EDEEFF] font-mono text-sm leading-relaxed line-clamp-2">
          {markee.message || <span className="opacity-40 italic">No message</span>}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {markee.name && <span className="text-[#8A8FBF] text-xs">{markee.name}</span>}
          {isOwner && (
            <span className="text-xs bg-[#F897FE]/15 border border-[#F897FE]/30 text-[#F897FE] px-2 py-0.5 rounded-full">
              yours
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <span className="text-[#F897FE] text-sm font-semibold">{formatRate(markee.rate)}</span>
        {onBack && (
          <button onClick={onBack} className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
            stream to back
          </button>
        )}
      </div>
    </div>
  )
}

// ── Create-message modal (free createMarkee, then chains into StreamModal) ───────

function CreateMessageModal({
  board,
  onClose,
  onCreated,
}: {
  board: Address
  onClose: () => void
  onCreated: (address: Address, message: string, name: string) => void
}) {
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== board.toLowerCase()) continue
      try {
        const ev = decodeEventLog({ abi: MARKEE_CREATED_ABI, data: log.data, topics: log.topics })
        if (ev.eventName === 'MarkeeCreated') {
          onCreated(ev.args.markeeAddress, ev.args.message, ev.args.name)
          return
        }
      } catch {
        // not the MarkeeCreated event, keep scanning
      }
    }
    setError('Created, but could not read the new message address. Refresh the leaderboard.')
  }, [isSuccess, receipt, board, onCreated])

  const submit = () => {
    setError(null)
    if (!message.trim()) { setError('Enter a message.'); return }
    reset()
    writeContract({
      address: board,
      abi: StreamingLeaderboardABI,
      functionName: 'createMarkee',
      args: [message, name],
      chainId: CANONICAL_CHAIN.id,
    })
  }

  const busy = isPending || isConfirming || isSuccess

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: BG2, borderRadius: 16, border: `1px solid ${BORDER}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)', color: TEXT, overflow: 'hidden',
          fontFamily: 'Manrope, system-ui, sans-serif',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>Add a message</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isCorrectChain ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ color: '#B8B6D9', marginBottom: 16, fontSize: 14 }}>Switch to {CANONICAL_CHAIN.name} to add a message.</p>
              <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={primaryBtn}>Switch to Base</button>
            </div>
          ) : (
            <>
              <label style={{ display: 'block' }}>
                <div style={fieldLabel}>Message</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Your message on the board"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <label style={{ display: 'block' }}>
                <div style={fieldLabel}>Name (optional)</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="who's this from" style={inputStyle} />
              </label>
              <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                {isSuccess ? 'Opening stream…' : isConfirming ? 'Creating…' : isPending ? 'Confirm in wallet' : 'Create message'}
              </button>
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Creating a message is free. You back it with a stream next, which sets its rank.
              </div>
            </>
          )}
          {error && <div style={{ fontFamily: MONO, fontSize: 12, color: '#FF9DA0', lineHeight: 1.5 }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}

const fieldLabel: React.CSSProperties = {
  fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: BG, color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontFamily: MONO, fontSize: 13, outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
  background: PINK, color: BG, fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer',
}
