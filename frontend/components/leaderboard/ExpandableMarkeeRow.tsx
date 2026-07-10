'use client'

import { useEffect, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { formatEther, parseAbiItem } from 'viem'
import {
  ChevronRight,
  Coins,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  RefreshCw,
  User,
} from 'lucide-react'
import { BASE_MARKEE_EVENTS_FROM_BLOCK, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getAddressUrl, getTxUrl } from '@/lib/explorer'
import type { Markee } from '@/types'

export interface ExpandableMarkeeRowSlot {
  address: string
  message: string
  name?: string
  owner: string
  totalFundsAdded: bigint
}

interface ExpandableMarkeeRowProps {
  markee: ExpandableMarkeeRowSlot
  rank: number
  formatFunds: (wei: bigint) => string
  leaderboardAddress?: `0x${string}`
  viewCount?: number
  featured?: boolean
  onAddFunds?: () => void
  actionLabel?: string
  onEditMessage?: () => void
  trackView?: (m: Markee) => void
}

type TxHistoryEvent =
  | {
      id: string
      kind: 'funds'
      amount: bigint
      newTotal: bigint
      actor: string
      timestamp: number
      blockNumber: bigint
      logIndex: number
      transactionHash: string
    }
  | {
      id: string
      kind: 'message'
      message: string
      actor: string
      timestamp: number
      blockNumber: bigint
      logIndex: number
      transactionHash: string
    }
  | {
      id: string
      kind: 'name'
      name: string
      actor: string
      timestamp: number
      blockNumber: bigint
      logIndex: number
      transactionHash: string
    }

type TxHistoryEventWithoutTimestamp = TxHistoryEvent extends infer Event
  ? Event extends { timestamp: number }
    ? Omit<Event, 'timestamp'>
    : never
  : never

const FUNDS_ADDED = parseAbiItem(
  'event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)'
)
const MESSAGE_CHANGED = parseAbiItem(
  'event MessageChanged(string newMessage, address indexed changedBy)'
)
const NAME_CHANGED = parseAbiItem(
  'event NameChanged(string newName, address indexed changedBy)'
)

const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK = '#F897FE'
const BLUE = '#7C9CFF'
const BG = '#060A2A'
const BG2 = '#0A0F3D'
const TEXT = '#EDEEFF'
const TEXT2 = '#B8B6D9'
const MUTED = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'
const LB_COLS = '42px 150px 120px minmax(260px,1fr) 70px 170px'
const MAX_HISTORY_EVENTS = 50

type ApiHistoryEvent =
  | {
      id: string
      kind: 'funds'
      amount: string
      newTotal: string
      actor: string
      timestamp: number
      blockNumber: string
      logIndex: number
      transactionHash: string
    }
  | {
      id: string
      kind: 'message'
      message: string
      actor: string
      timestamp: number
      blockNumber: string
      logIndex: number
      transactionHash: string
    }
  | {
      id: string
      kind: 'name'
      name: string
      actor: string
      timestamp: number
      blockNumber: string
      logIndex: number
      transactionHash: string
    }

function slotToMarkee(slot: ExpandableMarkeeRowSlot): Markee {
  return {
    address: slot.address,
    message: slot.message,
    owner: slot.owner,
    totalFundsAdded: slot.totalFundsAdded,
    chainId: CANONICAL_CHAIN_ID,
    pricingStrategy: '',
  }
}

function timeAgo(ts: number): string {
  if (!ts) return ''
  const seconds = Math.floor(Date.now() / 1000 - ts)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return `${Math.floor(seconds / 2592000)}mo ago`
}

function formatTimestamp(ts: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function EventIcon({ kind }: { kind: TxHistoryEvent['kind'] }) {
  if (kind === 'funds') {
    return (
      <div className="w-7 h-7 rounded-full bg-[#7C9CFF]/20 flex items-center justify-center flex-shrink-0">
        <Coins size={13} className="text-[#7C9CFF]" />
      </div>
    )
  }

  if (kind === 'message') {
    return (
      <div className="w-7 h-7 rounded-full bg-[#F897FE]/20 flex items-center justify-center flex-shrink-0">
        <MessageSquare size={13} className="text-[#F897FE]" />
      </div>
    )
  }

  return (
    <div className="w-7 h-7 rounded-full bg-[#FFA94D]/20 flex items-center justify-center flex-shrink-0">
      <User size={13} className="text-[#FFA94D]" />
    </div>
  )
}

export function ExpandableMarkeeRow({
  markee,
  rank,
  formatFunds,
  leaderboardAddress,
  viewCount,
  featured = false,
  onAddFunds,
  actionLabel = 'Add Funds',
  onEditMessage,
  trackView,
}: ExpandableMarkeeRowProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN_ID })
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState<TxHistoryEvent[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  useEffect(() => {
    if (markee.message) {
      trackView?.(slotToMarkee(markee))
    }
  }, [markee.address]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return
    if (!leaderboardAddress && !publicClient) return

    let cancelled = false

    async function fetchHistory() {
      setIsLoadingHistory(true)
      setHistoryError(null)

      try {
        const markeeAddress = markee.address as `0x${string}`

        if (leaderboardAddress) {
          const params = new URLSearchParams({
            leaderboardAddress,
            markeeAddress,
          })
          const response = await fetch(`/api/markee/history?${params.toString()}`, {
            cache: 'no-store',
          })

          if (!response.ok) {
            throw new Error('Unable to load transaction history')
          }

          const data = await response.json() as { history?: ApiHistoryEvent[] }
          const events: TxHistoryEvent[] = (data.history ?? []).map(event => {
            if (event.kind === 'funds') {
              return {
                ...event,
                amount: BigInt(event.amount),
                newTotal: BigInt(event.newTotal),
                blockNumber: BigInt(event.blockNumber),
              }
            }

            return {
              ...event,
              blockNumber: BigInt(event.blockNumber),
            }
          })

          if (!cancelled) setHistory(events)
          return
        }

        const historyLogs = await Promise.all([
          publicClient!.getLogs({ address: markeeAddress, event: FUNDS_ADDED, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
          publicClient!.getLogs({ address: markeeAddress, event: MESSAGE_CHANGED, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
          publicClient!.getLogs({ address: markeeAddress, event: NAME_CHANGED, fromBlock: BASE_MARKEE_EVENTS_FROM_BLOCK, toBlock: 'latest' }),
        ])

        const [fundsLogs, messageLogs, nameLogs] = historyLogs

        const eventsWithoutTimestamps: TxHistoryEventWithoutTimestamp[] = [
          ...fundsLogs.map(log => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            kind: 'funds' as const,
            amount: ((log.args as any).amount as bigint) ?? 0n,
            newTotal: (((log.args as any).newMarkeeTotal as bigint) ?? ((log.args as any).newTotal as bigint)) ?? 0n,
            actor: ((log.args as any).addedBy as string) ?? '',
            blockNumber: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            transactionHash: log.transactionHash ?? '',
          })),
          ...messageLogs.map(log => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            kind: 'message' as const,
            message: ((log.args as any).newMessage as string) ?? '',
            actor: (((log.args as any).updatedBy as string) ?? ((log.args as any).changedBy as string)) ?? '',
            blockNumber: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            transactionHash: log.transactionHash ?? '',
          })),
          ...nameLogs.map(log => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            kind: 'name' as const,
            name: ((log.args as any).newName as string) ?? '',
            actor: (((log.args as any).updatedBy as string) ?? ((log.args as any).changedBy as string)) ?? '',
            blockNumber: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            transactionHash: log.transactionHash ?? '',
          })),
        ].sort((a, b) => {
          if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex
          return b.blockNumber > a.blockNumber ? 1 : -1
        }).slice(0, MAX_HISTORY_EVENTS)

        const blockNumbers = eventsWithoutTimestamps
          .map(event => event.blockNumber)
          .filter(blockNumber => blockNumber !== 0n)
        const uniqueBlocks = [...new Set(blockNumbers.map(String))].map(BigInt)
        const blocks = await Promise.all(uniqueBlocks.map(blockNumber => publicClient!.getBlock({ blockNumber })))
        const timestamps = new Map(blocks.map(block => [block.number.toString(), Number(block.timestamp)]))
        const events: TxHistoryEvent[] = eventsWithoutTimestamps.map(event => ({
          ...event,
          timestamp: timestamps.get(event.blockNumber.toString()) ?? 0,
        }))

        if (!cancelled) setHistory(events)
      } catch (err) {
        if (!cancelled) {
          setHistoryError(err instanceof Error ? err.message : 'Unable to load transaction history')
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false)
      }
    }

    fetchHistory()
    return () => { cancelled = true }
  }, [expanded, historyRefreshKey, leaderboardAddress, markee.address, publicClient])

  const latestTxHash = history[0]?.transactionHash
  const displayName = markee.name || formatAddress(markee.owner)

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, background: featured ? `${PINK}0A` : 'transparent' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: LB_COLS,
          gap: 16,
          padding: '13px 16px',
          alignItems: 'center',
          borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? `Collapse transaction history for row ${rank}` : `Expand transaction history for row ${rank}`}
          aria-expanded={expanded}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: `1px solid ${BORDER}`,
            background: 'transparent',
            color: MUTED,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight size={15} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 140ms' }} />
        </button>

        <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>

        <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {formatFunds(markee.totalFundsAdded)}
        </span>

        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {markee.message || <span className="opacity-40 italic">No message</span>}
          </p>
        </div>

        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Eye size={10} style={{ opacity: 0.7 }} />
          {viewCount !== undefined && viewCount > 0 ? viewCount.toLocaleString() : '-'}
        </span>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          {isOwner && onEditMessage && (
            <button
              type="button"
              onClick={onEditMessage}
              style={{
                background: 'transparent',
                color: TEXT2,
                border: `1px solid ${BORDER}`,
                borderRadius: 7,
                padding: '8px 13px',
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}
          {onAddFunds && (
            <button
              type="button"
              onClick={onAddFunds}
              style={{
                background: PINK,
                color: BG,
                border: 'none',
                borderRadius: 7,
                padding: '8px 14px',
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${BORDER}`, background: BG, padding: '12px 16px 14px', borderLeft: featured ? `3px solid ${PINK}` : '3px solid transparent' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A8FBF]">
              Transaction history
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setHistoryRefreshKey(value => value + 1)}
                disabled={isLoadingHistory}
                className="inline-flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] disabled:opacity-50 disabled:hover:text-[#8A8FBF] transition-colors"
              >
                <RefreshCw size={10} className={isLoadingHistory ? 'animate-spin' : undefined} />
                Refresh
              </button>
              {latestTxHash && (
                <a
                  href={getTxUrl(CANONICAL_CHAIN_ID, latestTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors"
                >
                  View latest on Basescan
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-[#8A8FBF] py-3">
              <Loader2 size={14} className="animate-spin" />
              Loading transaction history...
            </div>
          ) : historyError ? (
            <p className="text-sm text-red-300 py-3">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#8A8FBF] py-3">
              No on-chain history found for this message yet.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-lg border border-[#8A8FBF]/15 bg-[#0A0F3D] px-3 py-2.5"
                >
                  <EventIcon kind={event.kind} />
                  <div className="min-w-0 flex-1">
                    {event.kind === 'funds' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#7C9CFF]">
                          +{formatEther(event.amount)} ETH
                        </span>
                        <span className="text-xs text-[#8A8FBF]">
                          to {formatEther(event.newTotal)} ETH total
                        </span>
                      </div>
                    ) : event.kind === 'message' ? (
                      <p className="text-sm text-[#EDEEFF] font-mono break-words">
                        {event.message || '(empty message)'}
                      </p>
                    ) : (
                      <p className="text-sm text-[#EDEEFF]">
                        Name changed to <span className="font-medium">{event.name || '(cleared)'}</span>
                      </p>
                    )}
                    {event.actor && (
                      <a
                        href={getAddressUrl(CANONICAL_CHAIN_ID, event.actor)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors mt-1"
                      >
                        by {formatAddress(event.actor)}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-[#8A8FBF]" title={formatTimestamp(event.timestamp)}>
                      {timeAgo(event.timestamp)}
                    </p>
                    <a
                      href={getTxUrl(CANONICAL_CHAIN_ID, event.transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors mt-1"
                    >
                      tx
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
