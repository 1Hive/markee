'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { X, Trophy, RefreshCw, Zap, Pin } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  account: string
  totalPoints: number
  eventCount: number
  lastEventAt: string | null
}

interface RewardsData {
  accounts: LeaderboardEntry[]
  totalDocs: number
  campaignTotals: {
    addFunds: number
    farcasterFollow: number
  }
}

interface RewardsModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'Never'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function getRankStyle(rank: number) {
  if (rank === 1) return 'text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/40'
  if (rank === 2) return 'text-[#C0C0C0] bg-[#C0C0C0]/10 border-[#C0C0C0]/30'
  if (rank === 3) return 'text-[#CD7F32] bg-[#CD7F32]/10 border-[#CD7F32]/30'
  return 'text-[#8A8FBF] bg-[#0A0F3D] border-[#8A8FBF]/20'
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function RewardsRow({
  entry,
  rank,
  isConnectedWallet,
}: {
  entry: LeaderboardEntry
  rank: number
  isConnectedWallet: boolean
}) {
  const isTop3 = rank <= 3

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        isConnectedWallet
          ? 'bg-[#F897FE]/10 border-[#F897FE]/40'
          : isTop3
          ? 'bg-[#0A0F3D] border-[#8A8FBF]/30 hover:border-[#F897FE]/30'
          : 'bg-[#0A0F3D]/60 border-[#8A8FBF]/15 hover:border-[#8A8FBF]/30'
      }`}
    >
      {/* Rank badge */}
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-xs font-bold ${getRankStyle(rank)}`}
      >
        {isTop3 ? (
          <><Trophy size={12} className="mr-0.5" />{rank}</>
        ) : (
          `#${rank}`
        )}
      </div>

      {/* Address */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={`https://basescan.org/address/${entry.account}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-[#EDEEFF] hover:text-[#F897FE] transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {shortAddress(entry.account)}
          </a>
          {isConnectedWallet && (
            <span className="text-[10px] font-semibold bg-[#F897FE]/20 text-[#F897FE] px-2 py-0.5 rounded-full border border-[#F897FE]/30">
              You
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#8A8FBF] mt-0.5">
          {entry.eventCount} {entry.eventCount === 1 ? 'event' : 'events'} · {timeAgo(entry.lastEventAt)}
        </p>
      </div>

      {/* Points */}
      <div className="flex-shrink-0 text-right">
        <p className={`text-base font-bold tabular-nums ${isTop3 ? 'text-[#F897FE]' : 'text-[#EDEEFF]'}`}>
          {entry.totalPoints.toLocaleString()}
        </p>
        <p className="text-[10px] text-[#8A8FBF] uppercase tracking-wider">pts</p>
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function RewardsModal({
  isOpen,
  onClose,
  title = 'Season 5 SUP Rewards',
  description = 'Earn points by buying messages and adding funds to any Superfluid message.',
}: RewardsModalProps) {
  const { address } = useAccount()
  const [data, setData] = useState<RewardsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true)
      else setIsRefreshing(true)
      setError(null)
      const res = await fetch('/api/superfluid/rewards')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch {
      setError('Failed to load rewards data.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchData()
    } else {
      setData(null)
      setError(null)
    }
  }, [isOpen, fetchData])

  if (!isOpen) return null

  const connectedIdx = address
    ? (data?.accounts.findIndex(e => e.account.toLowerCase() === address.toLowerCase()) ?? -1)
    : -1
  const connectedEntry = connectedIdx >= 0 ? data!.accounts[connectedIdx] : null
  const connectedRank = connectedIdx >= 0 ? connectedIdx + 1 : null

  const totalAwarded =
    (data?.campaignTotals.addFunds ?? 0) + (data?.campaignTotals.farcasterFollow ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gradient-to-br from-[#0A0F3D] to-[#060A2A] border border-[#8A8FBF]/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#8A8FBF]/20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
              <Trophy size={18} className="text-[#F897FE]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[#EDEEFF] font-bold text-lg">{title}</h2>
                <span className="flex items-center gap-1 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-[#1DB227] animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[#8A8FBF] text-xs mt-0.5">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {data && (
          <div className="flex items-center gap-6 px-6 py-3 border-b border-[#8A8FBF]/15 bg-[#060A2A]/40 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F897FE]" />
              <span className="text-[#F897FE] font-semibold">{data.totalDocs.toLocaleString()}</span>
              <span className="text-[#8A8FBF]">eligible addresses</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Zap size={11} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">{totalAwarded.toLocaleString()}</span>
              <span className="text-[#8A8FBF]">points awarded</span>
            </div>
          </div>
        )}

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-[#0A0F3D] rounded-xl border border-[#8A8FBF]/10 animate-pulse" />
            ))
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-[#8A8FBF] text-sm">{error}</p>
              <button onClick={() => fetchData()} className="mt-3 text-[#F897FE] text-sm hover:underline">
                Try again
              </button>
            </div>
          ) : data?.accounts.length === 0 ? (
            <div className="py-12 text-center">
              <Trophy size={28} className="text-[#8A8FBF] mx-auto mb-3" />
              <p className="text-[#EDEEFF] font-semibold mb-1">No participants yet</p>
              <p className="text-[#8A8FBF] text-sm">Buy a message to earn the first points.</p>
            </div>
          ) : (
            <>
              {/* Pinned: connected wallet at top */}
              {connectedEntry && connectedRank && (
                <>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#F897FE] font-semibold uppercase tracking-wider px-1">
                    <Pin size={9} />
                    Your ranking
                  </div>
                  <RewardsRow
                    entry={connectedEntry}
                    rank={connectedRank}
                    isConnectedWallet
                  />
                  <div className="border-t border-[#8A8FBF]/20 pt-1" />
                </>
              )}
              {data?.accounts.map((entry, i) => {
                if (address && entry.account.toLowerCase() === address.toLowerCase()) return null
                return (
                  <RewardsRow
                    key={entry.account}
                    entry={entry}
                    rank={i + 1}
                    isConnectedWallet={false}
                  />
                )
              })}
            </>
          )}
        </div>

        {/* How points work footer */}
        <div className="flex-shrink-0 border-t border-[#8A8FBF]/20 px-6 py-4 bg-[#060A2A]/40">
          <p className="text-[#8A8FBF] text-[10px] uppercase tracking-wider mb-2 font-semibold">How to Earn Points</p>
          <div className="flex flex-col gap-1.5 text-xs text-[#8A8FBF]">
            <span>🪧 Buy a message or add funds to an existing message: 10k pts per ETH</span>
            <span className="flex items-center gap-1.5">
              🟣 Follow @markee on Farcaster: 1pt
              <a
                href="https://farcaster.xyz/markee"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
                aria-label="Open Markee on Farcaster"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
