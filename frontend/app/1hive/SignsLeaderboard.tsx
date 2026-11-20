'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ModeratedContent } from '@/components/moderation'
import { StrategyBadge } from '@/components/StrategyBadge'
import { LiveDot } from '@/components/ui/LiveDot'
import { fmtWeiUsd } from '@/components/account/primitives'
import useFlowingAmount from '@/hooks/useFlowingAmount'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { SECONDS_IN_MONTH } from '@/lib/strategy'
import { MONO, PINK, GREEN, TEXT, TEXT2, MUTED } from '@/lib/design-tokens'
import { CAMPAIGN_1HIVE_MIN_VIEWS, type Campaign1HiveSign } from '@/lib/campaigns/1hive'
import { CAMPAIGN_CARD } from './styles'

const COLS = 6
/** Waits before each automatic retry of a failed load (ms); after these, a Try again button shows. */
const RETRY_DELAYS = [2_000, 5_000]

function SignRow({ sign, rank, ethPrice }: { sign: Campaign1HiveSign; rank: number; ethPrice: number | null }) {
  const streaming = sign.strategy === 'streaming'
  const rate = BigInt(sign.topRateRaw)
  const bid = BigInt(sign.topBidRaw)
  // For Rent totals tick forward from the listing snapshot, the same as the marketplace.
  const total = useFlowingAmount(BigInt(sign.totalFundsRaw), sign.streamedAt, streaming ? BigInt(sign.streamedRateRaw) : 0n)
  const none = <span style={{ color: MUTED }}>-</span>

  return (
    <tr className="border-b border-[#8A8FBF]/15 last:border-b-0">
      <td className="px-6 py-5" style={{ color: MUTED }}>#{rank}</td>
      <td className="px-4 py-5" style={{ color: TEXT }}>
        <Link href={`/markee/${sign.address}`} className="hover:text-[#F897FE]">{sign.site}</Link>
      </td>
      <td className="max-w-[320px] px-4 py-5" style={{ color: TEXT }}>
        <div className="flex items-center gap-3">
          {/* No current #1 (e.g. every stream has stopped): nothing to moderate, so skip the check. */}
          {sign.topMessage && sign.topMarkeeAddress ? (
            <ModeratedContent placeholderLines={1} chainId={CANONICAL_CHAIN_ID} message={sign.topMessage} markeeId={sign.topMarkeeAddress} className="min-w-0">
              <div className="truncate">{sign.topMessage}</div>
            </ModeratedContent>
          ) : (
            <div className="min-w-0 truncate" style={{ color: MUTED, fontStyle: 'italic' }}>No message yet</div>
          )}
          <StrategyBadge strategy={sign.strategy} size="xs" />
        </div>
      </td>
      <td className="px-4 py-5 text-right tabular-nums" style={{ color: TEXT }}>
        {sign.views.toLocaleString('en-US')}
        {/* Listed so the sign can see where it stands, but not funded until it reaches the minimum. */}
        {sign.views < CAMPAIGN_1HIVE_MIN_VIEWS && (
          <span
            className="mt-1.5 block whitespace-nowrap text-[10px] uppercase tracking-[1px]"
            style={{ color: MUTED }}
            title={`Signs need at least ${CAMPAIGN_1HIVE_MIN_VIEWS} views to earn a bonus`}
          >
            Needs {CAMPAIGN_1HIVE_MIN_VIEWS}+ views
          </span>
        )}
      </td>
      <td className="px-4 py-5 text-right font-bold tabular-nums" style={{ color: PINK }}>
        {streaming
          ? rate > 0n
            ? <span className="inline-flex items-center justify-end gap-2"><LiveDot color={GREEN} size={7} />{fmtWeiUsd(rate * SECONDS_IN_MONTH, ethPrice)}/mo</span>
            : none
          : bid > 0n ? fmtWeiUsd(bid, ethPrice) : none}
      </td>
      <td className="px-6 py-5 text-right tabular-nums" style={{ color: TEXT }}>{total > 0n ? fmtWeiUsd(total, ethPrice) : none}</td>
    </tr>
  )
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <tr key={i} className="border-b border-[#8A8FBF]/15 last:border-b-0">
          {Array.from({ length: COLS }, (_, c) => (
            <td key={c} className="px-4 py-5 first:px-6 last:px-6">
              <span className="skeleton block h-3 rounded" style={{ background: 'rgba(138,143,191,0.15)', width: c === 2 ? '80%' : '60%', marginLeft: c >= 3 ? 'auto' : undefined }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SignsLeaderboard({ createHref }: { createHref: string }) {
  const [signs, setSigns] = useState<Campaign1HiveSign[] | null>(null)
  const [ethPrice, setEthPrice] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped by Try again to start a fresh round of attempts.
  const [round, setRound] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = (n: number) => {
      fetch('/api/campaigns/1hive')
        .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
        .then((d: { leaderboards?: Campaign1HiveSign[]; ethPriceUsd?: number | null }) => {
          if (cancelled) return
          setSigns(d.leaderboards ?? [])
          setEthPrice(d.ethPriceUsd ?? null)
        })
        .catch(() => {
          if (cancelled) return
          if (n < RETRY_DELAYS.length) timer = setTimeout(() => attempt(n + 1), RETRY_DELAYS[n])
          else setFailed(true)
        })
    }
    attempt(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [round])

  const retry = () => { setFailed(false); setRound(r => r + 1) }

  const empty = signs !== null && signs.length === 0

  return (
    <div className={`${CAMPAIGN_CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm" style={{ fontFamily: MONO }}>
          <thead>
            <tr className="border-b border-[#8A8FBF]/20 text-[11px] uppercase tracking-[2px]" style={{ color: MUTED }}>
              <th className="px-6 py-4 text-left font-medium">#</th>
              <th className="px-4 py-4 text-left font-medium">Site</th>
              <th className="px-4 py-4 text-left font-medium">Current message</th>
              <th className="px-4 py-4 text-right font-medium">Views</th>
              <th className="px-4 py-4 text-right font-medium">Now earning</th>
              <th className="px-6 py-4 text-right font-medium">Total earned</th>
            </tr>
          </thead>
          <tbody>
            {signs === null && !failed && <SkeletonRows />}
            {signs?.map((s, i) => <SignRow key={s.address} sign={s} rank={i + 1} ethPrice={ethPrice} />)}
          </tbody>
        </table>
      </div>
      {failed && (
        <div className="px-6 py-10 text-center text-sm" style={{ fontFamily: MONO, color: TEXT2 }} role="alert">
          <p>Couldn&apos;t load the leaderboard.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-full border border-[#F897FE]/40 px-4 py-2 text-xs font-bold uppercase tracking-[1px] transition-colors hover:bg-[#F897FE]/10"
            style={{ color: PINK }}
          >
            Try again
          </button>
        </div>
      )}
      {empty && !failed && (
        <p className="px-6 py-10 text-center text-sm" style={{ fontFamily: MONO, color: TEXT2 }}>
          No signs earning yet. Yours could be first.
        </p>
      )}
      <Link
        href={createHref}
        className="flex items-center gap-2 border-t border-dashed border-[#8A8FBF]/25 px-6 py-4 text-sm font-bold transition-colors hover:bg-[#F897FE]/5"
        style={{ fontFamily: MONO, color: PINK }}
      >
        <Plus size={16} aria-hidden /> Create a Markee
      </Link>
    </div>
  )
}
