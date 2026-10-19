'use client'

// Buyer Hub: the Stream Balance card (ETHx that pays for Rent bids, with inline Deposit/Withdraw)
// and the Your Messages table (every message the wallet owns or has funded).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useBalance, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { type Address, type Hex } from 'viem'
import { ChevronDown } from 'lucide-react'
import { StrategyBadge } from '@/components/StrategyBadge'
import { ModeratedContent, FlagButton } from '@/components/moderation'
import type { DepositManagerStream } from '@/components/modals/DepositManagerModal'
import { parseEthInput, sanitizeDecimalInput } from '@/components/modals/StreamUI'
import { CANONICAL_CHAIN, CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { TopDawgPartnerStrategyABI } from '@/lib/contracts/abis'
import { STREAMING_BASE, ETHX_WRAP_ABI, formatRunway, runwaySeconds } from '@/lib/superfluid/streaming'
import { formatTransactionError } from '@/lib/transactionErrors'
import { MONO, PINK, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER, SANS, AMBER, DANGER, CARD_BG, PURPLE } from '@/lib/design-tokens'
import type { FundedMessage, MyMessage } from '@/components/account/types'
import { PanelHead, SECONDS_PER_MONTH, SegToggle, WalletPending, fmtCount, fmtWeiUsd, isUserRejection } from '@/components/account/primitives'
import { PlatformGlyph, messageShownOn } from '@/components/account/sites'
import { PulseDot } from '@/components/account/CreatorHub'
import { useToast } from '@/components/account/Toast'

const label: React.CSSProperties = { fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: MUTED }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', color: TEXT, fontSize: 13.5, outline: 'none', fontFamily: MONO }
const OVERTAKE_INCREMENT = 1_000_000_000_000_000n
const TWELVE_MONTHS = SECONDS_PER_MONTH * 12n

// ── Stream Balance ────────────────────────────────────────────────────────────
export interface StreamSnapshot {
  ethxBalanceRaw: string
  streams: DepositManagerStream[]
  at: number
}

export function useStreamSnapshot(activeAddress: string | undefined, refreshKey: number) {
  const [snapshot, setSnapshot] = useState<StreamSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!activeAddress) return
    let cancelled = false
    setFailed(false)
    fetch(`/api/streaming/deposit-manager?wallet=${activeAddress}${refreshKey ? '&bust=1' : ''}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setSnapshot({ ...d, at: Date.now() }) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [activeAddress, refreshKey])
  return { snapshot, failed }
}

export function winningRate(snapshot: StreamSnapshot | null): bigint {
  return (snapshot?.streams ?? []).filter(s => s.isTop).reduce((s, x) => s + BigInt(x.rateRaw), 0n)
}

function BalanceAction({ mode, balance, onDone, onCancel }: { mode: 'deposit' | 'withdraw'; balance: bigint; onDone: () => void; onCancel: () => void }) {
  const { address, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletBalance } = useBalance({ address: address as Address | undefined, chainId: CANONICAL_CHAIN.id })
  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<Hex | undefined>()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: CANONICAL_CHAIN.id })
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const wei = parseEthInput(amount)
  const tooMuch = mode === 'withdraw' ? wei > balance : !!walletBalance && wei > walletBalance.value
  const bad = wei <= 0n || tooMuch
  const wrongChain = !!chain && chain.id !== CANONICAL_CHAIN.id

  useEffect(() => {
    if (!isSuccess) return
    toast(`${mode === 'deposit' ? 'Deposited' : 'Withdrew'} ${amount} ETH`)
    onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const go = async () => {
    if (bad) return
    if (wrongChain) { switchChain({ chainId: CANONICAL_CHAIN.id }); return }
    setError(null)
    try {
      setHash(mode === 'deposit'
        ? await writeContractAsync({ address: STREAMING_BASE.ethx as Address, abi: ETHX_WRAP_ABI, functionName: 'upgradeByETH', value: wei, chainId: CANONICAL_CHAIN.id })
        : await writeContractAsync({ address: STREAMING_BASE.ethx as Address, abi: ETHX_WRAP_ABI, functionName: 'downgradeToETH', args: [wei], chainId: CANONICAL_CHAIN.id }))
    } catch (e) {
      if (!isUserRejection(e)) setError(formatTransactionError(e))
    }
  }

  const busy = isPending || confirming
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ position: 'relative', flex: '1 1 200px' }}>
          <input
            autoFocus
            inputMode="decimal"
            disabled={busy}
            value={amount}
            onChange={e => { setAmount(sanitizeDecimalInput(e.target.value)); setError(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && !bad) go(); if (e.key === 'Escape') onCancel() }}
            placeholder={mode === 'deposit' ? 'Amount to deposit' : `Up to ${(Number(balance) / 1e18).toFixed(6)}`}
            style={{ ...inputStyle, paddingRight: 48, borderColor: amount && tooMuch ? 'rgba(255,138,155,0.5)' : BORDER }}
          />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: MONO, fontSize: 11, color: MUTED }}>ETH</span>
        </span>
        {busy ? <WalletPending label={isPending ? 'Confirm in wallet…' : 'Confirming…'} /> : (
          <>
            <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: TEXT2, fontSize: 13, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', padding: '0 6px', height: 38 }}>Cancel</button>
            <button
              disabled={bad}
              onClick={go}
              style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '0 16px', height: 38, fontSize: 13, fontWeight: 700, fontFamily: SANS, cursor: bad ? 'not-allowed' : 'pointer', opacity: bad ? 0.4 : 1 }}
            >
              {wrongChain ? 'Switch to Base' : mode === 'deposit' ? 'Deposit' : 'Withdraw'}
            </button>
          </>
        )}
      </div>
      {amount && tooMuch && <div style={{ fontSize: 12, color: DANGER, marginTop: 8, textAlign: 'right' }}>{mode === 'withdraw' ? 'More than your ETHx balance.' : 'More than the ETH in your wallet.'}</div>}
      {error && <div style={{ fontSize: 12, color: DANGER, marginTop: 8, textAlign: 'right' }}>{error}</div>}
    </div>
  )
}

export function StreamBalanceCard({ snapshot: data, failed, ethPrice, onRetry, onChanged }: {
  snapshot: StreamSnapshot | null
  failed: boolean
  ethPrice: number | null
  onRetry: () => void
  onChanged: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [mode, setMode] = useState<'deposit' | 'withdraw' | null>(null)
  const snapshotAt = data?.at ?? now

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const streams = data?.streams ?? []
  const winning = streams.filter(s => s.isTop)
  const liveRate = winningRate(data)
  const totalRate = streams.reduce((s, x) => s + BigInt(x.rateRaw), 0n)
  const balanceRaw = data ? BigInt(data.ethxBalanceRaw) : 0n
  const drained = liveRate * BigInt(Math.max(0, Math.floor((now - snapshotAt) / 1000)))
  const balance = balanceRaw > drained ? balanceRaw - drained : 0n
  const runway = runwaySeconds(balance, liveRate)
  const pct = liveRate > 0n ? Math.min(100, Number((runway * 10_000n) / TWELVE_MONTHS) / 100) : 0
  const low = liveRate > 0n && runway < 7n * 86_400n
  const perMo = (rate: bigint, color: string) => (
    <span style={{ fontSize: 14, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      {fmtWeiUsd(rate * SECONDS_PER_MONTH, ethPrice)}<span style={{ fontSize: 11.5, fontWeight: 500, color: MUTED }}>/mo</span>
    </span>
  )

  return (
    <section style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <PanelHead label="Stream Balance" sub="Pays for your Rent bids while they're winning." />
      {failed && !data ? (
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: DANGER }}>
          Could not load your stream balance.
          <button onClick={onRetry} style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 12px', height: 32, fontSize: 12.5, fontWeight: 600, fontFamily: SANS, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={label}>Balance</div>
              {data
                ? <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: TEXT, marginTop: 4 }}>{(Number(balance) / 1e18).toFixed(6)} <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>ETHx</span></div>
                : <div style={{ width: 140, height: 24, marginTop: 6, background: 'rgba(138,143,191,0.08)', borderRadius: 6 }} />}
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={label}>Runs Out In</div>
              {data
                ? <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: low ? AMBER : TEXT, marginTop: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{liveRate > 0n ? formatRunway(runway) : 'Not streaming'}</div>
                : <div style={{ width: 120, height: 18, marginTop: 8, background: 'rgba(138,143,191,0.08)', borderRadius: 6 }} />}
            </div>
            {!mode && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="acct-btn-lg" onClick={() => setMode('deposit')} style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '0 16px', height: 38, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>Deposit</button>
                <button className="acct-btn-lg" disabled={!data} onClick={() => setMode('withdraw')} style={{ background: 'transparent', color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 14px', height: 38, fontSize: 13, fontWeight: 600, cursor: data ? 'pointer' : 'not-allowed', fontFamily: SANS, whiteSpace: 'nowrap' }}>Withdraw</button>
              </div>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(138,143,191,0.15)', marginTop: 14, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${PINK}, ${PURPLE})`, transition: 'width 400ms ease' }} />
          </div>
          {mode && <BalanceAction key={mode} mode={mode} balance={balance} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChanged() }} />}
        </div>
      )}
      {streams.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', borderTop: `1px solid ${BORDER}` }}>
          {[
            { l: 'Streaming Now', v: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{liveRate > 0n && <PulseDot />}{perMo(liveRate, liveRate > 0n ? GREEN : TEXT2)}</span> },
            { l: 'Winning', v: <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: TEXT }}>{winning.length}</span> },
            { l: 'Monthly Bid Total', v: perMo(totalRate, TEXT) },
            { l: 'Rent Bids', v: <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: TEXT }}>{streams.length}</span> },
          ].map((c, i) => (
            <div key={c.l} style={{ padding: '12px 18px', borderLeft: i ? `1px solid ${BORDER}` : 'none' }}>
              <div style={label}>{c.l}</div>
              <div style={{ marginTop: 6, display: 'flex' }}>{c.v}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Your Messages ─────────────────────────────────────────────────────────────
export const MSG_COLS = 'minmax(0,1fr) 64px 96px 64px 104px'
type MsgSortKey = 'views' | 'bid' | 'cpm'

interface MsgRow {
  m: MyMessage | FundedMessage
  own: boolean
  bid: bigint
  spent: bigint
  top: bigint
  rate: bigint
  views: number
}

function SortTh({ k, label: text, sort, onSort }: { k: MsgSortKey; label: string; sort: { k: MsgSortKey | null; dir: 'asc' | 'desc' }; onSort: (k: MsgSortKey) => void }) {
  const on = sort.k === k
  return (
    <button
      onClick={() => onSort(k)}
      aria-sort={on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      style={{ ...label, color: on ? TEXT : MUTED, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, width: '100%' }}
    >
      {text}
      <ChevronDown size={10} style={{ opacity: on ? 1 : 0.35, transform: on && sort.dir === 'asc' ? 'rotate(180deg)' : 'none' }} />
    </button>
  )
}

// Inline message edit for fixed-price boards: the same updateMessage call EditMessageModal makes.
function InlineEdit({ m, onDone, onCancel }: { m: MyMessage; onDone: () => void; onCancel: () => void }) {
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync, isPending } = useWriteContract()
  const [hash, setHash] = useState<Hex | undefined>()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: CANONICAL_CHAIN.id })
  const [draft, setDraft] = useState(m.message)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const wrongChain = !!chain && chain.id !== CANONICAL_CHAIN.id
  const ready = !!draft.trim() && draft.trim() !== m.message

  useEffect(() => {
    if (!isSuccess) return
    toast('Message updated')
    onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const save = async () => {
    if (!ready) return
    if (wrongChain) { switchChain({ chainId: CANONICAL_CHAIN.id }); return }
    setError(null)
    try {
      setHash(await writeContractAsync({
        address: m.strategyId as Address, abi: TopDawgPartnerStrategyABI, functionName: 'updateMessage',
        args: [m.address as Address, draft.trim()], chainId: CANONICAL_CHAIN.id,
      }))
    } catch (e) {
      if (!isUserRejection(e)) setError(formatTransactionError(e))
    }
  }

  const busy = isPending || confirming
  return (
    <span style={{ display: 'block' }} onClick={e => e.stopPropagation()}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          autoFocus
          disabled={busy}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
          style={{ ...inputStyle, padding: '6px 9px', fontSize: 13, fontFamily: SANS }}
        />
        {busy ? <WalletPending label={isPending ? 'Confirm in wallet…' : 'Saving…'} /> : (
          <>
            <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: TEXT2, fontSize: 12, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', padding: '0 6px', height: 30 }}>Cancel</button>
            <button onClick={save} disabled={!ready} style={{ background: PINK, color: BG, border: 'none', borderRadius: 8, padding: '0 10px', height: 30, fontSize: 12, fontWeight: 700, fontFamily: SANS, cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.4 }}>{wrongChain ? 'Switch' : 'Save'}</button>
          </>
        )}
      </span>
      {error && <span style={{ display: 'block', fontSize: 12, color: DANGER, marginTop: 6 }}>{error}</span>}
    </span>
  )
}

// Net ETH each owned Rent message has streamed (streamed - refunded), for its CPM.
function useRentSpend(owner: string | undefined, bought: MyMessage[]): Record<string, bigint> {
  const [spend, setSpend] = useState<Record<string, bigint>>({})
  const rent = bought.filter(m => m.strategy === 'streaming')
  const key = rent.map(m => `${m.strategyId}:${m.address}`).join(',')
  useEffect(() => {
    if (!owner || !key) return
    let cancelled = false
    Promise.all(key.split(',').map(async pair => {
      const [board, markee] = pair.split(':')
      const d = await fetch(`/api/streaming/lifetime-streamed?board=${board}&markee=${markee}&backer=${owner}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      return d ? [markee.toLowerCase(), BigInt(d.streamedWei) - BigInt(d.refundedWei)] as const : null
    })).then(rows => { if (!cancelled) setSpend(Object.fromEntries(rows.filter((r): r is readonly [string, bigint] => !!r))) })
    return () => { cancelled = true }
  }, [owner, key])
  return spend
}

export function YourMessages({ owner, bought, funded, loading, boardViews, ethPrice, onAddFunds, onChangeBid, onEditStreaming, onPriceButton, onEdited }: {
  owner: string | undefined
  bought: MyMessage[]
  funded: FundedMessage[]
  loading: boolean
  boardViews: Record<string, number>
  ethPrice: number | null
  onAddFunds: (m: MyMessage | FundedMessage, own: boolean) => void
  onChangeBid: (m: MyMessage) => void
  onEditStreaming: (m: MyMessage) => void
  onPriceButton: (m: MyMessage | FundedMessage) => void
  onEdited: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'winning' | 'outbid'>('all')
  const [sort, setSort] = useState<{ k: MsgSortKey | null; dir: 'asc' | 'desc' }>({ k: null, dir: 'desc' })
  const [editing, setEditing] = useState<string | null>(null)
  const rentSpend = useRentSpend(owner, bought)

  const rows = useMemo<MsgRow[]>(() => {
    const own = new Set(bought.map(m => m.address.toLowerCase()))
    const views = (m: MyMessage | FundedMessage) => boardViews[m.strategyId.toLowerCase()] ?? 0
    return [
      ...bought.map(m => ({
        m, own: true, bid: m.totalFundsAdded, top: m.topFunds, rate: BigInt(m.flowRateRaw ?? '0'), views: views(m),
        spent: m.strategy === 'streaming' ? (rentSpend[m.address.toLowerCase()] ?? 0n) : m.totalFundsAdded,
      })),
      ...funded.filter(m => !own.has(m.address.toLowerCase())).map(m => ({ m, own: false, bid: BigInt(m.totalFundsAdded), spent: BigInt(m.totalContributed), top: BigInt(m.topFundsRaw), rate: BigInt(m.flowRateRaw ?? '0'), views: views(m) })),
    ]
  }, [bought, funded, boardViews, rentSpend])

  const cpmOf = useCallback((r: MsgRow) => ethPrice && r.views && r.spent > 0n ? (Number(r.spent) / 1e18 * ethPrice) / r.views * 1000 : null, [ethPrice])
  const bidWei = (r: MsgRow) => r.m.strategy === 'streaming' ? r.rate * SECONDS_PER_MONTH : r.bid
  const winningN = rows.filter(r => r.m.isTop).length

  const list = useMemo(() => {
    const filtered = rows.filter(r => filter === 'all' || (filter === 'winning') === r.m.isTop)
    if (!sort.k) return [...filtered].sort((a, b) => Number(b.m.isTop) - Number(a.m.isTop))
    const val = (r: MsgRow) => sort.k === 'views' ? r.views : sort.k === 'bid' ? Number(bidWei(r)) : (cpmOf(r) ?? Infinity)
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...filtered].sort((a, b) => (val(a) - val(b)) * dir)
  // bidWei only reads row fields
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, sort, cpmOf])

  const onSort = (k: MsgSortKey) => setSort(prev => ({ k, dir: prev.k === k && prev.dir === 'desc' ? 'asc' : 'desc' }))
  const actionBtn: React.CSSProperties = { width: 104, height: 32, padding: '0 8px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', borderRadius: 8, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }
  const ghostAction: React.CSSProperties = { ...actionBtn, background: 'transparent', color: TEXT, border: '1px solid rgba(237,238,255,0.45)' }
  const priceAction: React.CSSProperties = { ...actionBtn, background: PINK, color: BG, border: `1px solid ${PINK}`, fontFamily: MONO, fontWeight: 800, letterSpacing: -0.2 }

  return (
    <section style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <PanelHead label="Your Messages" n={loading ? undefined : rows.length}>
        <SegToggle
          label="Filter messages"
          value={filter}
          onChange={setFilter}
          options={[
            { k: 'all', l: 'All', n: rows.length },
            { k: 'winning', l: 'Winning', n: winningN },
            { k: 'outbid', l: 'Outbid', n: rows.length - winningN },
          ]}
        />
      </PanelHead>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 14, padding: '11px 18px', alignItems: 'center' }}>
            <span style={label}>Message</span>
            <SortTh k="views" label="Views" sort={sort} onSort={onSort} />
            <SortTh k="bid" label="Your bid" sort={sort} onSort={onSort} />
            <SortTh k="cpm" label="CPM" sort={sort} onSort={onSort} />
            <span />
          </div>
          {loading && [1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 14, padding: '16px 18px', borderTop: `1px solid ${BORDER}` }}>
              {[1, 2, 3, 4, 5].map(j => <div key={j} style={{ height: 16, background: 'rgba(138,143,191,0.08)', borderRadius: 4 }} />)}
            </div>
          ))}
          {!loading && list.length === 0 && (
            <div style={{ padding: '22px 18px', borderTop: `1px solid ${BORDER}`, fontSize: 13, color: MUTED }}>
              {filter === 'winning' ? 'None of your messages are winning right now.' : filter === 'outbid' ? 'No outbid messages.' : 'No messages yet.'}
            </div>
          )}
          {!loading && list.map(r => {
            const { m } = r
            const rent = m.strategy === 'streaming'
            const cpm = cpmOf(r)
            const on = messageShownOn(m)
            const topRate = BigInt((m as MyMessage).topRateRaw ?? '0')
            const price = rent ? topRate * SECONDS_PER_MONTH : r.top + OVERTAKE_INCREMENT
            const priceText = `${fmtWeiUsd(price, ethPrice)}${rent ? '/mo' : ''}`
            return (
              <div
                key={m.address}
                className="acct-row acct-row-click"
                onClick={() => window.location.href = `/markee/${m.strategyId || m.address}`}
                style={{ display: 'grid', gridTemplateColumns: MSG_COLS, gap: 14, padding: '12px 18px', alignItems: 'center', borderTop: `1px solid ${BORDER}` }}
              >
                <span style={{ minWidth: 0 }}>
                  {editing === m.address ? (
                    <InlineEdit m={m as MyMessage} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); onEdited() }} />
                  ) : (
                    <span style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={m.address} boardAdmin={m.admin} className="min-w-0 flex-1">
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 14, fontWeight: 600, color: !m.message ? MUTED : m.isTop ? TEXT : TEXT2, lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {m.message || 'No message'}
                        </span>
                      </ModeratedContent>
                      {r.own ? (
                        <button
                          className="acct-hover"
                          onClick={e => { e.stopPropagation(); if (rent) onEditStreaming(m as MyMessage); else setEditing(m.address) }}
                          style={{ flexShrink: 0, background: BG2, color: TEXT2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 9px', height: 26, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}
                        >
                          Edit
                        </button>
                      ) : (
                        <span onClick={e => e.stopPropagation()}><FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={m.address} boardAdmin={m.admin} compact /></span>
                      )}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 12, color: MUTED, minWidth: 0 }}>
                    <PlatformGlyph platform={m.platform} size={12} color={MUTED} />
                    {on
                      ? <span title={on} style={{ fontFamily: MONO, fontSize: 11.5, color: TEXT2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{on}</span>
                      : <span>Not on a site yet</span>}
                    <StrategyBadge strategy={m.strategy ?? 'fixed'} size="xs" />
                    {!r.own && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED, border: '1px solid rgba(138,143,191,0.35)', borderRadius: 99, padding: '1px 7px' }}>Funded</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, fontSize: 12 }}>
                    {m.isTop ? (
                      <><PulseDot /><span style={{ color: GREEN, fontWeight: 600 }}>Winning</span></>
                    ) : (
                      <>
                        <span style={{ width: 7, height: 7, borderRadius: 99, border: `1.5px solid ${MUTED}`, boxSizing: 'border-box', flexShrink: 0 }} />
                        <span style={{ color: MUTED }}>{m.rank ? `Outbid · #${m.rank}` : 'Outbid'}</span>
                      </>
                    )}
                  </span>
                </span>

                <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12.5, color: r.views ? TEXT2 : MUTED }}>{r.views ? fmtCount(r.views) : '-'}</span>

                {rent ? (r.rate === 0n
                  ? <span style={{ textAlign: 'right', fontSize: 12, color: MUTED }}>Stream ended</span>
                  : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      {m.isTop && <PulseDot />}
                      <span style={{ fontSize: 14, fontWeight: 700, color: m.isTop ? GREEN : TEXT2, whiteSpace: 'nowrap' }}>
                        {fmtWeiUsd(r.rate * SECONDS_PER_MONTH, ethPrice)}<span style={{ fontSize: 11.5, fontWeight: 500, color: MUTED }}>/mo</span>
                      </span>
                    </span>)
                  : <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: m.isTop ? TEXT : TEXT2, whiteSpace: 'nowrap' }}>{fmtWeiUsd(r.bid, ethPrice)}</span>}

                <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12.5, color: cpm != null ? TEXT2 : MUTED }}>{cpm != null ? `$${cpm.toFixed(2)}` : '-'}</span>

                <span style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  {m.isTop ? (
                    rent && r.own
                      ? <button onClick={() => onChangeBid(m as MyMessage)} style={ghostAction}>Change Bid</button>
                      : <button onClick={() => onAddFunds(m, r.own)} style={ghostAction}>Add Funds</button>
                  ) : (rent ? topRate > 0n : true) ? (
                    <button onClick={() => onPriceButton(m)} aria-label={`Bid ${priceText} to win`} style={priceAction}>{priceText}</button>
                  ) : (
                    <button onClick={() => onPriceButton(m)} style={ghostAction}>Bid to Win</button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
