'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, ChevronDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkeeDetail } from '@/lib/contracts/useMarkeeDetail'
import { formatEth, formatAddress } from '@/lib/utils'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { MarkeeABI, LeaderboardV11ABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { PARTNERS } from '@/lib/contracts/usePartnerMarkees'

// ── Types ─────────────────────────────────────────────────────────────

interface LeaderboardRow {
  address: string
  owner: string
  name: string
  message: string
  totalFundsAdded: bigint
}

type ModalState = null | {
  mode: 'create' | 'addFunds' | 'updateMessage'
  target: LeaderboardRow | null
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(ts: bigint | number): string {
  const date = new Date(Number(ts) * 1000)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-[#8A8FBF]/20 rounded" />
      <div className="bg-[#0A0F3D] rounded-xl p-8 border border-[#8A8FBF]/20">
        <div className="h-10 w-3/4 bg-[#8A8FBF]/20 rounded mb-4" />
        <div className="h-5 w-1/4 bg-[#8A8FBF]/20 rounded ml-auto" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20">
            <div className="h-3 w-16 bg-[#8A8FBF]/20 rounded mb-2" />
            <div className="h-6 w-24 bg-[#8A8FBF]/20 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20" />
        ))}
      </div>
    </div>
  )
}

// ── FeaturedCard ─────────────────────────────────────────────────────

function FeaturedCard({ message, owner, ownerAddress, totalFundsAdded, totalViews, onBid }: {
  message: string
  owner: string
  ownerAddress: string
  totalFundsAdded: bigint
  totalViews: number | null
  onBid: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onBid} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="relative w-full text-left cursor-pointer rounded-[16px] p-[18px_26px_22px] backdrop-blur-sm transition-[border-color,transform,box-shadow] duration-[180ms]"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${hover ? 'rgba(248,151,254,0.5)' : 'rgba(255,255,255,0.18)'}`,
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 16px 44px rgba(6,10,42,0.55)' : 'none',
      }}>
      <div className="flex items-center justify-end mb-3 font-mono text-[10.5px] tracking-[1.5px] uppercase">
        <span className="inline-flex items-center gap-1 text-[#7C9CFF]">
          <Eye size={11} />
          {totalViews !== null ? formatViewCount(totalViews) : '—'}
        </span>
      </div>
      <div className="font-mono font-bold leading-[1.12] tracking-[-0.02em]"
        style={{ fontSize: 'clamp(20px,3vw,34px)', background: 'linear-gradient(120deg, #EDEEFF 0%, #F897FE 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {message || <span className="opacity-40 italic">No message yet</span>}
      </div>
      <div className="mt-[14px] flex items-center justify-end gap-2 text-[13px] flex-wrap">
        <span className="text-[#8A8FBF]">—</span>
        <span className="text-[#EDEEFF]">{owner}</span>
        <span className="text-[#8A8FBF] font-mono text-[11px]">{formatAddress(ownerAddress)}</span>
      </div>
      <span className="absolute bottom-[-15px] left-1/2 inline-flex items-center gap-1.5 bg-[#F897FE] text-[#060A2A] font-mono font-bold text-[13px] px-[18px] py-2 rounded-lg whitespace-nowrap shadow-[0_8px_28px_rgba(248,151,254,0.42)] pointer-events-none z-[3] transition-[opacity,transform] duration-[180ms]"
        style={{ transform: `translateX(-50%) translateY(${hover ? '0' : '4px'})`, opacity: hover ? 1 : 0 }}>
        {totalFundsAdded > 0n ? `${formatEth(totalFundsAdded + BigInt('1000000000000000'))} ETH to change` : 'Buy a Message'}
      </span>
    </button>
  )
}

// ── MetricsBar ────────────────────────────────────────────────────────

function MetricsBar({ strategyAddress, strategyStats, totalViews, markee }: {
  strategyAddress: string
  strategyStats: { totalFunds: bigint; markeeCount: number } | null
  totalViews: number
  markee: any
}) {
  const partner = PARTNERS.find(p =>
    p.leaderboardAddress?.toLowerCase() === strategyAddress.toLowerCase() ||
    p.strategyAddress?.toLowerCase() === strategyAddress.toLowerCase()
  )

  const totalFunds = strategyStats?.totalFunds ?? markee.totalFundsAdded
  const markeeCount = strategyStats?.markeeCount ?? markee.fundsAddedCount

  return (
    <div className="max-w-[1100px] grid gap-6 py-[26px] border-t border-b border-[#8A8FBF]/20"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {partner?.liveUrl && (
        <div className="flex flex-col gap-[7px] min-w-0">
          <span className="font-mono text-[10px] tracking-[1px] uppercase text-[#8A8FBF]">Served on</span>
          <a href={partner.liveUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[15px] font-bold no-underline border-b border-dotted self-start"
            style={{ color: '#EDEEFF', borderColor: '#8A8FBF' }}>
            {stripProtocol(partner.liveUrl)}
          </a>
        </div>
      )}
      <div className="flex flex-col gap-[7px] min-w-0">
        <span className="font-mono text-[10px] tracking-[1px] uppercase text-[#8A8FBF]">Total funds added</span>
        <span className="font-mono text-[18px] font-bold tracking-[-0.5px]" style={{ color: '#1DB227' }}>{formatEth(totalFunds)} ETH</span>
      </div>
      <div className="flex flex-col gap-[7px] min-w-0">
        <span className="font-mono text-[10px] tracking-[1px] uppercase text-[#8A8FBF]">Total views</span>
        <span className="font-mono text-[18px] font-bold tracking-[-0.5px]" style={{ color: '#7C9CFF' }}>{totalViews > 0 ? formatViewCount(totalViews) : '—'}</span>
      </div>
      <div className="flex flex-col gap-[7px] min-w-0">
        <span className="font-mono text-[10px] tracking-[1px] uppercase text-[#8A8FBF]">Messages bought</span>
        <span className="font-mono text-[18px] font-bold tracking-[-0.5px]" style={{ color: '#EDEEFF' }}>{markeeCount.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-[7px] min-w-0">
        <span className="font-mono text-[10px] tracking-[1px] uppercase text-[#8A8FBF]">Contract</span>
        <a href={`https://basescan.org/address/${strategyAddress}`} target="_blank" rel="noopener noreferrer"
          className="font-mono text-[18px] font-bold tracking-[-0.5px] no-underline border-b border-dotted self-start"
          style={{ color: '#F897FE', borderColor: '#F897FE' }}>
          {formatAddress(strategyAddress)} ↗
        </a>
      </div>
    </div>
  )
}

// ── RowHistoryPanel ───────────────────────────────────────────────────

const FUNDS_ADDED_EVENT = parseAbiItem('event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)')
const MESSAGE_CHANGED_EVENT = parseAbiItem('event MessageChanged(string newMessage, address indexed changedBy)')

interface HistoryEvent {
  type: 'Message bought' | 'Funds added' | 'Message edited'
  detail: string
  timestamp: number
  txHash: string
}

function RowHistoryPanel({ address, isOpen }: { address: string; isOpen: boolean }) {
  const client = usePublicClient({ chainId: CANONICAL_CHAIN_ID })
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [fetched, setFetched] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || fetched || !client) return
    setLoading(true)

    const addr = address as `0x${string}`

    Promise.all([
      client.getLogs({ address: addr, event: FUNDS_ADDED_EVENT, fromBlock: 0n, toBlock: 'latest' }),
      client.getLogs({ address: addr, event: MESSAGE_CHANGED_EVENT, fromBlock: 0n, toBlock: 'latest' }),
    ]).then(async ([fundsLogs, messageLogs]) => {
      const allBlockNums = [...fundsLogs, ...messageLogs]
        .map(l => l.blockNumber)
        .filter((n): n is bigint => n !== null)
      const uniqueBlocks = [...new Set(allBlockNums.map(String))].map(BigInt)
      const blockTimestamps = new Map<string, number>()

      if (uniqueBlocks.length > 0) {
        const blocks = await Promise.all(uniqueBlocks.map(n => client.getBlock({ blockNumber: n })))
        blocks.forEach(b => { blockTimestamps.set(b.number.toString(), Number(b.timestamp)) })
      }

      const ts = (blockNumber: bigint | null) =>
        blockNumber ? (blockTimestamps.get(blockNumber.toString()) ?? 0) : 0

      const result: HistoryEvent[] = []

      fundsLogs.forEach((log, i) => {
        const amount = (log.args as any).amount as bigint ?? 0n
        result.push({
          type: i === 0 ? 'Message bought' : 'Funds added',
          detail: i === 0 ? `by ${formatAddress((log.args as any).addedBy ?? '')}` : `+${formatEth(amount)} ETH`,
          timestamp: ts(log.blockNumber),
          txHash: log.transactionHash ?? '',
        })
      })

      messageLogs.forEach(log => {
        const msg = (log.args as any).newMessage as string ?? ''
        result.push({
          type: 'Message edited',
          detail: `"${msg.length > 40 ? msg.slice(0, 40) + '…' : msg}"`,
          timestamp: ts(log.blockNumber),
          txHash: log.transactionHash ?? '',
        })
      })

      result.sort((a, b) => b.timestamp - a.timestamp)
      const bought = result.filter(e => e.type === 'Message bought')
      const rest = result.filter(e => e.type !== 'Message bought')
      setEvents([...rest, ...bought])
      setFetched(true)
    }).catch(() => {
      setFetched(true)
    }).finally(() => {
      setLoading(false)
    })
  }, [isOpen, fetched, address, client])

  const icon = { 'Message bought': '🛒', 'Funds added': '＋', 'Message edited': '✎' } as const

  if (!isOpen) return null

  return (
    <div style={{ background: '#060A2A', borderTop: '1px solid rgba(138,143,191,0.2)', padding: '8px 16px 14px' }}>
      {loading && (
        <div className="py-3 font-mono text-[12px] text-[#8A8FBF]">Loading history…</div>
      )}
      {!loading && events.length === 0 && (
        <div className="py-3 font-mono text-[12px] text-[#8A8FBF]">No history found.</div>
      )}
      {events.map((ev, i) => (
        <div key={i} className="flex items-center gap-3 py-[9px] font-mono text-[12px]"
          style={{ borderBottom: i < events.length - 1 ? '1px solid rgba(138,143,191,0.2)' : 'none' }}>
          <span className="w-6 text-center text-[13px]">{icon[ev.type]}</span>
          <span className="text-[#EDEEFF] font-semibold min-w-[130px]">{ev.type}</span>
          <span className="text-[#B8B6D9] flex-1">{ev.detail}</span>
          <span className="text-[#8A8FBF] text-[11px]">{ev.timestamp ? formatTimestamp(ev.timestamp) : '—'}</span>
          {ev.txHash && (
            <a href={`https://basescan.org/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer"
              className="no-underline border-b border-dotted border-[#7C9CFF]"
              style={{ color: '#7C9CFF' }}>
              tx ↗
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ── StrategyLeaderboard ────────────────────────────────────────────────

const LB_COLS = '150px 120px 1fr 70px 188px'

function StrategyLeaderboard({ rows, rowViews, onAddFunds }: {
  rows: LeaderboardRow[]
  rowViews: Map<string, number>
  onAddFunds: (row: LeaderboardRow) => void
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (rows.length === 0) return null

  return (
    <div className="max-w-[1100px] mx-auto mt-10">
      <h2 className="m-0 mb-1 text-[clamp(22px,3vw,30px)] font-extrabold tracking-[-0.6px] text-[#EDEEFF]">Leaderboard</h2>
      <p className="mt-0 mb-5 text-[#B8B6D9] text-[15px]">The message with the most funds added takes the Top Spot.</p>
      <div className="overflow-x-auto rounded-[10px] border border-[#8A8FBF]/20">
        <div style={{ minWidth: 720, background: '#0A0F3D' }}>
          <div className="grid gap-4 px-4 py-[11px] border-b border-[#8A8FBF]/20 bg-[#060A2A] items-center font-mono text-[10px] font-semibold tracking-[1px] uppercase text-[#8A8FBF]"
            style={{ gridTemplateColumns: LB_COLS }}>
            <span>Bought by</span>
            <span>Funds added</span>
            <span>Current message</span>
            <span>Views</span>
            <span></span>
          </div>
          {rows.map((row, i) => (
            <div key={row.address}>
              <div className="grid gap-4 px-4 py-[13px] border-b border-[#8A8FBF]/20 items-center"
                style={{
                  gridTemplateColumns: LB_COLS,
                  background: i === 0 ? 'rgba(248,151,254,0.06)' : 'transparent',
                  borderLeft: i === 0 ? '3px solid #F897FE' : '3px solid transparent',
                }}>
                <span className="font-mono text-[12.5px] text-[#B8B6D9] truncate">
                  {row.name || formatAddress(row.owner)}
                </span>
                <span className="font-mono text-[12.5px] font-semibold" style={{ color: '#7C9CFF' }}>
                  {formatEth(row.totalFundsAdded)} ETH
                </span>
                <span className="font-mono text-[13px] text-[#EDEEFF] truncate">
                  {row.message || <span className="opacity-40 italic">No message</span>}
                </span>
                <span className="font-mono text-[12px]" style={{ color: '#8A8FBF' }}>
                  {formatViewCount(rowViews.get(row.address.toLowerCase()) ?? 0)}
                </span>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="inline-flex items-center gap-1 bg-transparent text-[#B8B6D9] rounded-[7px] px-3 py-[7px] text-[12.5px] font-semibold cursor-pointer font-sans whitespace-nowrap"
                    style={{ border: '1px solid rgba(138,143,191,0.2)' }}>
                    History
                    <ChevronDown size={12} style={{ transform: openIdx === i ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
                  </button>
                  <button
                    onClick={() => onAddFunds(row)}
                    className="bg-[#F897FE] text-[#060A2A] border-none rounded-[7px] px-[14px] py-[7px] text-[12.5px] font-bold cursor-pointer font-sans whitespace-nowrap">
                    Add Funds
                  </button>
                </div>
              </div>
              <RowHistoryPanel address={row.address} isOpen={openIdx === i} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FundsLeaderboard (fallback) ───────────────────────────────────────

function FundsLeaderboard({ events, onAddFunds }: { events: any[], onAddFunds: () => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  if (!events || events.length === 0) return null
  const cols = '150px 120px 1fr 188px'
  return (
    <div className="max-w-[1100px] mx-auto mt-10">
      <h2 className="m-0 mb-1 text-[clamp(22px,3vw,30px)] font-extrabold tracking-[-0.6px] text-[#EDEEFF]">Leaderboard</h2>
      <p className="mt-0 mb-5 text-[#B8B6D9] text-[15px]">The message with the most funds added takes the Top Spot.</p>
      <div className="overflow-x-auto rounded-[10px] border border-[#8A8FBF]/20">
        <div className="min-w-[580px] bg-[#0A0F3D]">
          <div className="grid gap-4 px-4 py-[11px] border-b border-[#8A8FBF]/20 bg-[#060A2A] items-center font-mono text-[10px] font-semibold tracking-[1px] uppercase text-[#8A8FBF]"
            style={{ gridTemplateColumns: cols }}>
            <span>Bought by</span><span>Funds added</span><span>Note</span><span></span>
          </div>
          {events.map((event, i) => (
            <div key={event.id || i}>
              <div className="grid gap-4 px-4 py-[13px] border-b border-[#8A8FBF]/20 items-center"
                style={{ gridTemplateColumns: cols, background: i === 0 ? 'rgba(248,151,254,0.06)' : 'transparent', borderLeft: i === 0 ? '3px solid #F897FE' : '3px solid transparent' }}>
                <span className="font-mono text-[12.5px] text-[#B8B6D9] truncate">{formatAddress(event.addedBy)}</span>
                <span className="font-mono text-[12.5px] font-semibold" style={{ color: '#7C9CFF' }}>+{formatEth(event.amount)} ETH</span>
                <span className="font-mono text-[13px] text-[#EDEEFF] truncate">{formatTimestamp(event.timestamp)}</span>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="inline-flex items-center gap-1 bg-transparent text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-[7px] px-3 py-[7px] text-[12.5px] font-semibold cursor-pointer font-sans whitespace-nowrap">
                    History <ChevronDown size={12} style={{ transform: openIdx === i ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }} />
                  </button>
                  <button onClick={onAddFunds}
                    className="bg-[#F897FE] text-[#060A2A] border-none rounded-[7px] px-[14px] py-[7px] text-[12.5px] font-bold cursor-pointer font-sans whitespace-nowrap">
                    Add Funds
                  </button>
                </div>
              </div>
              {openIdx === i && (
                <div className="col-span-full bg-[#060A2A] border-t border-[#8A8FBF]/20 px-4 py-2">
                  <div className="flex items-center gap-3 py-[9px] font-mono text-[12px]">
                    <span>＋</span>
                    <span className="text-[#EDEEFF] font-semibold min-w-[130px]">Funds added</span>
                    <span className="text-[#B8B6D9] flex-1">+{formatEth(event.amount)} ETH</span>
                    <span className="text-[#8A8FBF]">{formatTimestamp(event.timestamp)}</span>
                    <a href={`https://basescan.org/tx/${event.transactionHash}`} target="_blank" rel="noopener noreferrer"
                      className="no-underline border-b border-dotted border-[#7C9CFF]" style={{ color: '#7C9CFF' }}>tx ↗</a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────

export default function MarkeeDetailPage() {
  const params = useParams()
  const markeeAddress = params.address as string
  const { markee, isLoading, error } = useMarkeeDetail(markeeAddress)
  const client = usePublicClient({ chainId: CANONICAL_CHAIN_ID })

  const [totalViews, setTotalViews] = useState<number | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [strategyStats, setStrategyStats] = useState<{ totalFunds: bigint; markeeCount: number } | null>(null)
  const [rowViews, setRowViews] = useState<Map<string, number>>(new Map())
  const [modalState, setModalState] = useState<ModalState>(null)

  const { address } = useAccount()
  const isOwner = !!(markee && address && markee.owner.toLowerCase() === address.toLowerCase())

  useEffect(() => {
    if (!markee) return

    const track = async () => {
      try {
        const getRes = await fetch(`/api/views?addresses=${markee.address.toLowerCase()}`)
        if (getRes.ok) {
          const getData = await getRes.json()
          const count = getData[markee.address.toLowerCase()]?.totalViews
          if (count !== undefined) setTotalViews(count)
        }
      } catch {}

      if (!markee.message) return
      try {
        const res = await fetch('/api/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: markee.address, message: markee.message }),
        })
        if (res.ok) {
          const data = await res.json()
          setTotalViews(data.totalViews)
        }
      } catch (err) {
        console.error('[views] track failed:', err)
      }
    }

    track()
  }, [markee?.address])

  useEffect(() => {
    if (!markee?.pricingStrategy || !client) return
    const strategy = markee.pricingStrategy as `0x${string}`

    const fetchLeaderboard = async () => {
      try {
        const [topResult, totalFunds, markeeCount] = await Promise.all([
          client.readContract({ address: strategy, abi: LeaderboardV11ABI, functionName: 'getTopMarkees', args: [100n] }),
          client.readContract({ address: strategy, abi: LeaderboardV11ABI, functionName: 'totalLeaderboardFunds' }),
          client.readContract({ address: strategy, abi: LeaderboardV11ABI, functionName: 'markeeCount' }),
        ])

        const [addresses, funds] = topResult as [string[], bigint[]]
        setStrategyStats({ totalFunds: totalFunds as bigint, markeeCount: Number(markeeCount as bigint) })

        if (!addresses || addresses.length === 0) return

        const detailContracts = addresses.flatMap(addr => [
          { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'message' as const },
          { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'name' as const },
          { address: addr as `0x${string}`, abi: MarkeeABI, functionName: 'owner' as const },
        ])

        const detailResults = await client.multicall({ contracts: detailContracts })

        const rows: LeaderboardRow[] = addresses.map((addr, i) => ({
          address: addr,
          message: (detailResults[i * 3]?.result as string) ?? '',
          name: (detailResults[i * 3 + 1]?.result as string) ?? '',
          owner: (detailResults[i * 3 + 2]?.result as string) ?? '',
          totalFundsAdded: funds[i] ?? 0n,
        }))

        setLeaderboard(rows)

        try {
          const addrList = addresses.map(a => a.toLowerCase()).join(',')
          const viewsRes = await fetch(`/api/views?addresses=${addrList}`)
          if (viewsRes.ok) {
            const viewsData = await viewsRes.json()
            const map = new Map<string, number>()
            for (const [k, v] of Object.entries(viewsData)) {
              map.set(k.toLowerCase(), (v as any).totalViews ?? 0)
            }
            setRowViews(map)
          }
        } catch {}
      } catch {
        // legacy contract without getTopMarkees — fall through to existing FundsLeaderboard
      }
    }

    fetchLeaderboard()
  }, [markee?.pricingStrategy, client])

  const featuredRow = leaderboard[0]
  const featuredMessage = featuredRow?.message ?? markee?.message ?? ''
  const featuredOwner = featuredRow ? (featuredRow.name || formatAddress(featuredRow.owner)) : (markee ? (markee.name || formatAddress(markee.owner)) : '')
  const featuredOwnerAddress = featuredRow?.owner ?? markee?.owner ?? ''
  const featuredFunds = featuredRow?.totalFundsAdded ?? markee?.totalFundsAdded ?? 0n

  const strategyAddress = markee?.pricingStrategy ?? ''
  const totalViewsNum = (() => {
    if (leaderboard.length > 0 && rowViews.size > 0) {
      let sum = 0
      rowViews.forEach(v => { sum += v })
      return sum
    }
    return totalViews ?? 0
  })()

  return (
    <div className="min-h-screen bg-[#060A2A] text-[#EDEEFF]">
      <Header activePage="marketplace" />

      {isLoading && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <DetailSkeleton />
        </main>
      )}

      {error && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <p className="text-red-400 mb-2">Failed to load markee details</p>
            <p className="text-[#8A8FBF] text-sm">{error.message}</p>
          </div>
        </main>
      )}

      {markee && (
        <>
          <section className="relative z-[2] border-b border-[#8A8FBF]/20 py-11 px-4 sm:px-10"
            style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(248,151,254,0.18), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(124,156,255,0.2), transparent 55%), linear-gradient(180deg, #060A2A 0%, #0A0F3D 100%)' }}>
            <HeroBackground />
            <div className="relative z-10 max-w-[1100px] mx-auto">
              <div className="flex items-center gap-2 mb-4 font-mono text-[12px] text-[#8A8FBF] tracking-[2px] uppercase">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] shadow-[0_0_12px_#F897FE]" />
                Top Message
                <span className="flex-1 h-px bg-[#8A8FBF]/20 ml-2" />
              </div>
              <FeaturedCard
                message={featuredMessage}
                owner={featuredOwner}
                ownerAddress={featuredOwnerAddress}
                totalFundsAdded={featuredFunds}
                totalViews={totalViews}
                onBid={() => setModalState({ mode: 'addFunds', target: featuredRow ?? null })}
              />
              <div className="h-7" />
              <MetricsBar
                strategyAddress={strategyAddress}
                strategyStats={strategyStats}
                totalViews={totalViewsNum}
                markee={markee}
              />
            </div>
          </section>

          <section className="px-4 sm:px-10 py-2">
            {leaderboard.length > 0 ? (
              <StrategyLeaderboard
                rows={leaderboard}
                rowViews={rowViews}
                onAddFunds={row => setModalState({ mode: 'addFunds', target: row })}
              />
            ) : (
              <FundsLeaderboard
                events={markee.fundsAddedEvents}
                onAddFunds={() => setModalState({ mode: 'addFunds', target: null })}
              />
            )}
          </section>

          <section className="max-w-[1100px] mx-auto px-4 sm:px-10 py-5 pb-24 flex gap-[14px] flex-wrap justify-center">
            <button
              onClick={() => setModalState({ mode: 'create', target: null })}
              className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] rounded-lg px-[26px] py-[14px] font-bold text-[15px] cursor-pointer shadow-[0_8px_32px_rgba(248,151,254,0.3)] border-none transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px] hover:shadow-[0_12px_40px_rgba(248,151,254,0.42)]">
              Buy a New Message
            </button>
            <Link href="/create-a-markee"
              className="inline-flex items-center gap-2 bg-transparent text-[#B8B6D9] border border-[#8A8FBF]/20 rounded-lg px-[22px] py-[13px] font-sans text-[15px] no-underline transition-[border-color,color] duration-[160ms] hover:border-[rgba(248,151,254,0.35)] hover:text-[#EDEEFF]">
              Create Your Own Markee →
            </Link>
          </section>

          {isOwner && (
            <div className="fixed bottom-6 right-6 z-50">
              <button
                onClick={() => setModalState({ mode: 'updateMessage', target: null })}
                className="flex items-center gap-2 border border-[#F897FE]/40 text-[#F897FE] bg-[#060A2A]/90 backdrop-blur-sm hover:bg-[#F897FE]/10 font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-lg">
                Edit Message
              </button>
            </div>
          )}
        </>
      )}

      <Footer />

      {markee && modalState?.mode === 'addFunds' && (
        <TopDawgModal
          isOpen={true}
          onClose={() => setModalState(null)}
          userMarkee={modalState.target ? (modalState.target as any) : (markee as any)}
          initialMode="addFunds"
          onSuccess={() => setModalState(null)}
          strategyAddress={markee.pricingStrategy as `0x${string}`}
          partnerName={markee.isPartnerStrategy ? markee.strategyName : undefined}
          partnerSplitPercentage={markee.isPartnerStrategy ? markee.partnerPercentage : undefined}
          topFundsAdded={leaderboard[0]?.totalFundsAdded ?? markee.totalFundsAdded}
        />
      )}

      {markee && modalState?.mode === 'create' && (
        <TopDawgModal
          isOpen={true}
          onClose={() => setModalState(null)}
          userMarkee={null}
          initialMode="create"
          onSuccess={() => setModalState(null)}
          strategyAddress={markee.pricingStrategy as `0x${string}`}
          topFundsAdded={leaderboard[0]?.totalFundsAdded ?? markee.totalFundsAdded}
        />
      )}

      {markee && modalState?.mode === 'updateMessage' && (
        <TopDawgModal
          isOpen={true}
          onClose={() => setModalState(null)}
          userMarkee={markee as any}
          initialMode="updateMessage"
          onSuccess={() => setModalState(null)}
          strategyAddress={markee.pricingStrategy as `0x${string}`}
        />
      )}
    </div>
  )
}
