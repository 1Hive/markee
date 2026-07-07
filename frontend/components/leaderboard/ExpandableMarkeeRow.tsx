'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { formatEther, parseAbiItem } from 'viem'
import {
  ChevronRight,
  Coins,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  User,
} from 'lucide-react'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
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

const FUNDS_ADDED = parseAbiItem(
  'event FundsAdded(uint256 amount, uint256 newTotal, address indexed addedBy)'
)
const MESSAGE_CHANGED = parseAbiItem(
  'event MessageChanged(string newMessage, address indexed changedBy)'
)
const NAME_CHANGED = parseAbiItem(
  'event NameChanged(string newName, address indexed changedBy)'
)

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
  onAddFunds,
  actionLabel = '+ add funds',
  onEditMessage,
  trackView,
}: ExpandableMarkeeRowProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CANONICAL_CHAIN_ID })
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState<TxHistoryEvent[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  useEffect(() => {
    if (markee.message) {
      trackView?.(slotToMarkee(markee))
    }
  }, [markee.address]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded || history.length > 0) return
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
          publicClient!.getLogs({ address: markeeAddress, event: FUNDS_ADDED, fromBlock: 0n, toBlock: 'latest' }),
          publicClient!.getLogs({ address: markeeAddress, event: MESSAGE_CHANGED, fromBlock: 0n, toBlock: 'latest' }),
          publicClient!.getLogs({ address: markeeAddress, event: NAME_CHANGED, fromBlock: 0n, toBlock: 'latest' }),
        ])

        const [fundsLogs, messageLogs, nameLogs] = historyLogs

        const blockNumbers = [...fundsLogs, ...messageLogs, ...nameLogs]
          .map(log => log.blockNumber)
          .filter((n): n is bigint => n !== null)
        const uniqueBlocks = [...new Set(blockNumbers.map(String))].map(BigInt)
        const blocks = await Promise.all(uniqueBlocks.map(blockNumber => publicClient!.getBlock({ blockNumber })))
        const timestamps = new Map(blocks.map(block => [block.number.toString(), Number(block.timestamp)]))
        const ts = (blockNumber: bigint | null) => blockNumber ? timestamps.get(blockNumber.toString()) ?? 0 : 0

        const events: TxHistoryEvent[] = [
          ...fundsLogs.map(log => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            kind: 'funds' as const,
            amount: ((log.args as any).amount as bigint) ?? 0n,
            newTotal: (((log.args as any).newMarkeeTotal as bigint) ?? ((log.args as any).newTotal as bigint)) ?? 0n,
            actor: ((log.args as any).addedBy as string) ?? '',
            timestamp: ts(log.blockNumber),
            blockNumber: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            transactionHash: log.transactionHash ?? '',
          })),
          ...messageLogs.map(log => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            kind: 'message' as const,
            message: ((log.args as any).newMessage as string) ?? '',
            actor: (((log.args as any).updatedBy as string) ?? ((log.args as any).changedBy as string)) ?? '',
            timestamp: ts(log.blockNumber),
            blockNumber: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            transactionHash: log.transactionHash ?? '',
          })),
          ...nameLogs.map(log => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            kind: 'name' as const,
            name: ((log.args as any).newName as string) ?? '',
            actor: (((log.args as any).updatedBy as string) ?? ((log.args as any).changedBy as string)) ?? '',
            timestamp: ts(log.blockNumber),
            blockNumber: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            transactionHash: log.transactionHash ?? '',
          })),
        ].sort((a, b) => {
          if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex
          return b.blockNumber > a.blockNumber ? 1 : -1
        })

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
  }, [expanded, history.length, leaderboardAddress, markee.address, publicClient])

  const rankStyle = useMemo(() => {
    const rankColors: Record<number, string> = {
      1: 'text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10',
      2: 'text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10',
      3: 'text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10',
    }
    return rankColors[rank] ?? 'text-[#8A8FBF] border-[#8A8FBF]/20 bg-[#8A8FBF]/5'
  }, [rank])

  const latestTxHash = history[0]?.transactionHash

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-all overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-3">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? 'Collapse transaction history' : 'Expand transaction history'}
          aria-expanded={expanded}
          className="mt-1 flex-shrink-0 w-7 h-7 rounded-md border border-[#8A8FBF]/20 text-[#8A8FBF] hover:text-[#F897FE] hover:border-[#F897FE]/50 hover:bg-[#F897FE]/10 transition-colors flex items-center justify-center"
        >
          <ChevronRight size={15} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>

        <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${rankStyle}`}>
          {rank}
        </div>

        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-[#EDEEFF] font-mono text-sm leading-relaxed line-clamp-2">
            {markee.message || <span className="opacity-40 italic">No message</span>}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {markee.name && <span className="text-[#8A8FBF] text-xs">{markee.name}</span>}
            {viewCount !== undefined && viewCount > 0 && (
              <span className="text-[#8A8FBF] text-xs flex items-center gap-1">
                <Eye size={12} className="opacity-60" />
                <span>{viewCount.toLocaleString()}</span>
              </span>
            )}
            {isOwner && (
              <span className="text-xs bg-[#F897FE]/15 border border-[#F897FE]/30 text-[#F897FE] px-2 py-0.5 rounded-full">
                yours
              </span>
            )}
          </div>
        </button>

        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <span className="text-[#F897FE] text-sm font-semibold">{formatFunds(markee.totalFundsAdded)}</span>
          {onAddFunds && (
            <button
              type="button"
              onClick={onAddFunds}
              className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors"
            >
              {actionLabel}
            </button>
          )}
          {isOwner && onEditMessage && (
            <button
              type="button"
              onClick={onEditMessage}
              className="text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
            >
              edit message
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#8A8FBF]/15 bg-[#060A2A]/55 px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8A8FBF]">
              Transaction history
            </p>
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
