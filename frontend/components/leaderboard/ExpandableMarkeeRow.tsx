'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { Eye, Pencil } from 'lucide-react'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'
import { TxHistoryToggle, TxHistoryPanel } from '@/components/board-detail/shared'
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
  leaderboardAddress: `0x${string}`
  viewCount?: number
  viewsLoading?: boolean
  featured?: boolean
  onAddFunds?: () => void
  actionLabel?: string
  onEditMessage?: () => void
  trackView?: (m: Markee) => void
}

const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK = '#F897FE'
const BLUE = '#7C9CFF'
const PURP = '#7B6AF4'
const BG = '#060A2A'
const TEXT = '#EDEEFF'
const TEXT2 = '#B8B6D9'
const MUTED = '#8A8FBF'
const BORDER = 'rgba(138,143,191,0.2)'
const LB_COLS = '42px 150px 120px minmax(260px,1fr) 70px 170px'

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

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function ExpandableMarkeeRow({
  markee,
  rank,
  formatFunds,
  leaderboardAddress,
  viewCount,
  viewsLoading = false,
  featured = false,
  onAddFunds,
  actionLabel = 'Add Funds',
  onEditMessage,
  trackView,
}: ExpandableMarkeeRowProps) {
  const { address } = useAccount()
  const [expanded, setExpanded] = useState(false)

  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  useEffect(() => {
    if (markee.message) {
      trackView?.(slotToMarkee(markee))
    }
  }, [markee.address]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <TxHistoryToggle expanded={expanded} onClick={() => setExpanded(v => !v)} rank={rank} />

        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
          {isOwner && (
            <span style={{ background: `${PURP}33`, color: PURP, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>
              YOU
            </span>
          )}
        </span>

        <span style={{ fontSize: 12.5, color: BLUE, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {formatFunds(markee.totalFundsAdded)}
        </span>

        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {isOwner && onEditMessage && (
            <button
              type="button"
              onClick={onEditMessage}
              title="Edit message"
              style={{ flexShrink: 0, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: MUTED, lineHeight: 0, transition: 'color 120ms, border-color 120ms' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = PINK; el.style.borderColor = `${PINK}66` }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = MUTED; el.style.borderColor = BORDER }}
            >
              <Pencil size={11} />
            </button>
          )}
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {markee.message || <span className="opacity-40 italic">No message</span>}
          </p>
        </div>

        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Eye size={10} style={{ opacity: 0.7 }} />
          {viewsLoading ? <ViewsSpinner size={9} /> : viewCount !== undefined && viewCount > 0 ? viewCount.toLocaleString() : '-'}
        </span>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
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

      <TxHistoryPanel leaderboardAddress={leaderboardAddress} markeeAddress={markee.address} expanded={expanded} featured={featured} />
    </div>
  )
}
