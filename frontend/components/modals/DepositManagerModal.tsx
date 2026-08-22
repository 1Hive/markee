'use client'

// Wallet-wide ETHx dashboard for streaming ("For Rent") bids: how long the connected wallet's ETHx
// balance keeps its winning streams alive, a quick deposit/withdraw, and every stream it has open
// across every streaming board. Opened from the auto-deposit line on the streaming buy/fund modals
// and from a button on /account -- entirely wallet-scoped, so it takes no board/markee props.

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useBalance, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, formatEther, type Address, type Hex } from 'viem'
import { useActiveWallet } from '@/hooks/useActiveWallet'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import {
  STREAMING_BASE, ETHX_WRAP_ABI, ratePerSecToMonthly,
  runwaySeconds, runwayProgressPct, runwayTier, formatRunway,
} from '@/lib/superfluid/streaming'
import { useLiveBalance, formatLiveEth } from '@/hooks/useLiveBalance'
import { MONO, PINK, GREEN, BG, BG2, TEXT, TEXT2, MUTED, BORDER } from '@/lib/design-tokens'
import { sanitizeDecimalInput, parseEthInput, InfoTip } from '@/components/modals/StreamUI'
import { formatTransactionError, logTransactionError } from '@/lib/transactionErrors'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { fmtAddr, decimalsForWeiRate } from '@/components/board-detail/shared'
import { ViewsSpinner } from '@/components/ui/ViewsSpinner'
import { getTxUrl } from '@/lib/explorer'

const ETHX = STREAMING_BASE.ethx as Address
const GOLD = '#FFD700'
const RED = '#FF8E8E'

export interface DepositManagerStream {
  boardAddress: string
  boardName: string
  markeeAddress: string
  message: string
  name: string
  rank: number
  isTop: boolean
  rateRaw: string
}

const labelStyle: React.CSSProperties = { fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }

export function DepositManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeAddress, hasWallet, hasActiveWalletConnection, isWalletConnectionPending } = useActiveWallet()
  const { chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const isCorrectChain = hasActiveWalletConnection && chain?.id === CANONICAL_CHAIN.id
  const isWrongChain = hasActiveWalletConnection && chain?.id !== CANONICAL_CHAIN.id

  const [data, setData] = useState<{ ethxBalanceRaw: string; streams: DepositManagerStream[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<'deposit' | 'withdraw' | null>(null)
  const [amount, setAmount] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [depositPct, setDepositPct] = useState(50)
  const [withdrawPct, setWithdrawPct] = useState(50)
  const [lastTx, setLastTx] = useState<{ hash: Hex; type: 'deposit' | 'withdraw' } | null>(null)

  const refresh = useCallback((bust = false) => {
    if (!activeAddress) return
    setLoading(true)
    fetch(`/api/streaming/deposit-manager?wallet=${activeAddress}${bust ? '&bust=1' : ''}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [activeAddress])

  useEffect(() => {
    if (!isOpen || !activeAddress) return
    refresh()
  }, [isOpen, activeAddress, refresh])

  useEffect(() => {
    if (!isOpen) { setAction(null); setAmount(''); setActionError(null); setLastTx(null) }
  }, [isOpen])

  const { data: balanceData, refetch: refetchBalance } = useBalance({ address: activeAddress as Address | undefined, chainId: CANONICAL_CHAIN.id })

  const { writeContractAsync, isPending, reset: resetWrite } = useWriteContract()
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined)
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: CANONICAL_CHAIN.id })
  const busy = isPending || isConfirming

  useEffect(() => {
    if (isSuccess && txHash && action) {
      setLastTx({ hash: txHash, type: action })
      setTxHash(undefined); resetWrite(); setAction(null); setAmount('')
      // bust=1 -- the KV cache backing this endpoint can otherwise serve the pre-deposit/withdraw
      // balance for up to its TTL, so a normal refresh() right after a tx confirms can silently show
      // stale data until the cache naturally expires.
      refresh(true); refetchBalance()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const initialLoading = loading && !data
  // A refresh with data already on screen (post-deposit/withdraw bust=1 refetch) -- distinct from
  // initialLoading, which replaces the whole panel with a skeleton on first open instead.
  const refreshingBalance = loading && !!data
  const ethxBalanceRaw = data ? BigInt(data.ethxBalanceRaw) : 0n
  const streams = data?.streams ?? []
  const winning = streams.filter(s => s.isTop)
  const notStreaming = streams.filter(s => !s.isTop)
  const streamingNowRate = winning.reduce((sum, s) => sum + BigInt(s.rateRaw), 0n)
  const notStreamingRate = notStreaming.reduce((sum, s) => sum + BigInt(s.rateRaw), 0n)

  // Decimals derived from the actual drain rate (same helper used for every other live balance on
  // the site) so the last visible digit ticks about once a second, instead of a fixed decimal count
  // that looks frozen at typical streaming rates. Nothing draining -> a clean fixed precision instead
  // of decimalsForWeiRate's zero-rate fallback (max, 14dp), which would just be noisy trailing zeros.
  const balanceDecimals = streamingNowRate > 0n ? decimalsForWeiRate(streamingNowRate) : 4
  const liveEthxBalance = useLiveBalance(ethxBalanceRaw, -streamingNowRate, balanceDecimals)
  const displayedBalance = liveEthxBalance > 0n ? liveEthxBalance : 0n

  // The countdown ticks on its own 1s clock (not the balance's rAF cadence) so it counts down
  // exactly one second at a time instead of jumping unevenly whenever the balance display happens
  // to re-render.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isOpen])
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now())
  useEffect(() => { if (data) setSnapshotAt(Date.now()) }, [data])
  const elapsedSec = data ? BigInt(Math.max(0, Math.floor((nowTick - snapshotAt) / 1000))) : 0n
  const drained = streamingNowRate * elapsedSec
  const countdownBalance = ethxBalanceRaw > drained ? ethxBalanceRaw - drained : 0n
  const runway = runwaySeconds(countdownBalance, streamingNowRate)
  const tier = runwayTier(runway)
  const tierColor = tier === 'danger' ? RED : tier === 'warning' ? GOLD : PINK
  const progressPct = streamingNowRate > 0n ? runwayProgressPct(runway) : 100

  function depositShortcut(months: number) {
    if (streamingNowRate <= 0n) return
    setAmount(formatEther(ratePerSecToMonthly(streamingNowRate) * BigInt(months)))
    if (actionError) setActionError(null)
  }
  function depositPctChange(pct: number) {
    setDepositPct(pct)
    if (balanceData) setAmount(formatEther((balanceData.value * BigInt(pct)) / 100n))
    if (actionError) setActionError(null)
  }
  function withdrawPctChange(pct: number) {
    setWithdrawPct(pct)
    setAmount(formatEther((ethxBalanceRaw * BigInt(pct)) / 100n))
    if (actionError) setActionError(null)
  }

  async function handleDeposit() {
    setActionError(null)
    const wei = parseEthInput(amount)
    if (wei <= 0n) { setActionError('Enter an amount to deposit.'); return }
    if (balanceData && balanceData.value < wei) { setActionError('Not enough ETH in your wallet.'); return }
    try {
      const hash = await writeContractAsync({ address: ETHX, abi: ETHX_WRAP_ABI, functionName: 'upgradeByETH', value: wei, chainId: CANONICAL_CHAIN.id })
      setTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'DepositManagerModal.deposit')
      setActionError(formatTransactionError(e))
    }
  }

  async function handleWithdraw() {
    setActionError(null)
    const wei = parseEthInput(amount)
    if (wei <= 0n) { setActionError('Enter an amount to withdraw.'); return }
    if (wei > ethxBalanceRaw) { setActionError('Not enough ETHx balance.'); return }
    try {
      const hash = await writeContractAsync({ address: ETHX, abi: ETHX_WRAP_ABI, functionName: 'downgradeToETH', args: [wei], chainId: CANONICAL_CHAIN.id })
      setTxHash(hash)
    } catch (e: unknown) {
      logTransactionError(e, 'DepositManagerModal.withdraw')
      setActionError(formatTransactionError(e))
    }
  }

  if (!isOpen) return null

  const shortcutBtnStyle = (disabled: boolean): React.CSSProperties => ({
    flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, color: disabled ? MUTED : TEXT2,
    borderRadius: 6, padding: '5px 0', fontFamily: MONO, fontSize: 11, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(6,10,42,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeIn 180ms ease forwards',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: BG2, borderRadius: 16,
          border: `1px solid ${BORDER}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'Manrope, system-ui, sans-serif', color: TEXT, overflow: 'hidden',
          animation: 'scaleIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 16, color: TEXT, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: PINK, flexShrink: 0, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
            Deposit Manager
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4, fontFamily: 'inherit' }}>×</button>
        </div>

        {!hasWallet || isWalletConnectionPending ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Connect your wallet to view your deposits.</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}><ConnectButton /></div>
          </div>
        ) : isWrongChain ? (
          <div style={{ padding: '48px 22px', textAlign: 'center', flex: 1 }}>
            <p style={{ color: TEXT2, marginBottom: 22, fontSize: 15 }}>Switch to {CANONICAL_CHAIN.name} to continue.</p>
            <button onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })} style={{ background: PINK, color: BG, border: 'none', borderRadius: 10, padding: '12px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Switch to Base
            </button>
          </div>
        ) : (
          <div style={{ padding: '20px 22px 22px', overflowY: 'auto', flex: 1 }}>
            <button
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: PINK, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 18 }}
            >
              ← Back
            </button>

            {/* ── Runs out in (skipped entirely once we know there's nothing streaming -- an empty
                 wallet isn't a warning state, it just hasn't been set up yet) ── */}
            {(initialLoading || streamingNowRate > 0n) && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={labelStyle}>
                  Runs out in
                  <InfoTip>If you run out of ETHx, your bids will be cancelled.</InfoTip>
                </span>
                {initialLoading ? <ViewsSpinner size={14} color={MUTED} /> : (
                  <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: TEXT }}>
                    {formatRunway(runway)}
                  </span>
                )}
              </div>
              <div style={{ height: 8, borderRadius: 99, background: 'rgba(138,143,191,0.15)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${initialLoading ? 0 : progressPct}%`, borderRadius: 99,
                  background: tier === 'normal' ? `linear-gradient(90deg, ${PINK}, #7B6AF4)` : tierColor,
                  transition: 'width 400ms ease, background 400ms ease',
                }} />
              </div>
            </div>
            )}

            {/* ── ETHx balance ── */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>
                ETHx balance
                <InfoTip>Markee uses Superfluid for payment streaming. Deposit ETH to get ETHx you can use for payments.</InfoTip>
              </div>
              {initialLoading ? (
                <div style={{ marginBottom: 12 }}><ViewsSpinner size={20} color={TEXT} /></div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const }}>
                  <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: TEXT, opacity: refreshingBalance ? 0.5 : 1, transition: 'opacity 150ms' }}>
                    {formatLiveEth(displayedBalance, balanceDecimals)}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>ETH</span>
                  {refreshingBalance && <ViewsSpinner size={13} color={MUTED} />}
                </div>
              )}
              {lastTx && !refreshingBalance && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontFamily: MONO, fontSize: 11.5 }}>
                  <span style={{ color: GREEN }}>✓ {lastTx.type === 'deposit' ? 'Deposit' : 'Withdrawal'} confirmed</span>
                  <a
                    href={getTxUrl(CANONICAL_CHAIN.id, lastTx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: PINK, textDecoration: 'none', borderBottom: `1px dotted ${PINK}` }}
                  >
                    View on Basescan ↗
                  </a>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setAction(a => a === 'deposit' ? null : 'deposit'); setAmount(''); setActionError(null); setLastTx(null) }}
                  style={{
                    flex: 1,
                    background: action === 'deposit' ? 'rgba(248,151,254,0.12)' : 'transparent',
                    color: action === 'deposit' ? PINK : TEXT2,
                    border: `1px solid ${action === 'deposit' ? PINK : BORDER}`,
                    borderRadius: 8, padding: '9px 0',
                    fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Deposit
                </button>
                <button
                  onClick={() => { setAction(a => a === 'withdraw' ? null : 'withdraw'); setAmount(''); setActionError(null); setLastTx(null) }}
                  disabled={ethxBalanceRaw <= 0n}
                  title={ethxBalanceRaw <= 0n ? 'You have no ETHx deposited' : undefined}
                  style={{
                    flex: 1,
                    background: action === 'withdraw' ? 'rgba(248,151,254,0.12)' : 'transparent',
                    color: ethxBalanceRaw <= 0n ? MUTED : action === 'withdraw' ? PINK : TEXT2,
                    border: `1px solid ${action === 'withdraw' && ethxBalanceRaw > 0n ? PINK : BORDER}`,
                    borderRadius: 8, padding: '9px 0',
                    fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: ethxBalanceRaw > 0n ? 'pointer' : 'not-allowed',
                    opacity: ethxBalanceRaw > 0n ? 1 : 0.5,
                  }}
                >
                  Withdraw
                </button>
              </div>

              {action && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* ETH vs ETHx are easy to mix up -- spell out both explicitly here. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: MUTED }}>
                    <span>Wallet ETH: {balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : '—'}</span>
                    <span>ETHx Balance: {parseFloat(formatEther(ethxBalanceRaw)).toFixed(4)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={e => { setAmount(sanitizeDecimalInput(e.target.value)); if (actionError) setActionError(null) }}
                      placeholder={action === 'deposit' ? 'Amount to deposit (ETH)' : 'Amount to withdraw (ETHx)'}
                      disabled={busy}
                      style={{
                        flex: 1, background: BG, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 7,
                        padding: '8px 10px', fontFamily: MONO, fontSize: 13, outline: 'none',
                      }}
                    />
                    <button
                      onClick={action === 'deposit' ? handleDeposit : handleWithdraw}
                      disabled={busy || parseEthInput(amount) <= 0n}
                      style={{
                        background: PINK, color: BG, border: 'none', borderRadius: 7, padding: '8px 16px',
                        fontFamily: MONO, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                        cursor: busy || parseEthInput(amount) <= 0n ? 'not-allowed' : 'pointer',
                        opacity: busy || parseEthInput(amount) <= 0n ? 0.5 : 1,
                      }}
                    >
                      {busy ? (isPending ? 'Confirm…' : 'Pending…') : action === 'deposit' ? 'Deposit' : 'Withdraw'}
                    </button>
                  </div>
                  {action === 'deposit' ? (
                    streamingNowRate > 0n ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3].map(mo => (
                          <button key={mo} type="button" onClick={() => depositShortcut(mo)} style={shortcutBtnStyle(false)}>
                            {mo}mo
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10.5, color: MUTED }}>
                          <span>% of wallet balance</span>
                          <span style={{ color: TEXT2, fontWeight: 700 }}>{depositPct}%</span>
                        </div>
                        <input
                          type="range" min={1} max={100} value={depositPct}
                          onChange={e => depositPctChange(Number(e.target.value))}
                          disabled={!balanceData || balanceData.value <= 0n}
                          style={{ width: '100%', accentColor: PINK, cursor: 'pointer' }}
                        />
                      </div>
                    )
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10.5, color: MUTED }}>
                        <span>% of ETHx balance</span>
                        <span style={{ color: TEXT2, fontWeight: 700 }}>{withdrawPct}%</span>
                      </div>
                      <input
                        type="range" min={1} max={100} value={withdrawPct}
                        onChange={e => withdrawPctChange(Number(e.target.value))}
                        disabled={ethxBalanceRaw <= 0n}
                        style={{ width: '100%', accentColor: PINK, cursor: 'pointer' }}
                      />
                    </div>
                  )}
                  {actionError && <span style={{ fontFamily: MONO, fontSize: 11, color: RED }}>{actionError}</span>}
                </div>
              )}
            </div>

            {/* ── Streaming now / Bids not streaming ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div style={{ border: `1px solid rgba(29,178,39,0.35)`, background: 'rgba(29,178,39,0.06)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: GREEN, flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: GREEN, letterSpacing: 1, textTransform: 'uppercase' }}>Streaming now</span>
                </div>
                {initialLoading ? <ViewsSpinner size={16} color={GREEN} /> : (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: TEXT }}>
                      {parseFloat(formatEther(ratePerSecToMonthly(streamingNowRate))).toFixed(3)} <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>ETH/mo</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 2 }}>{winning.length} message{winning.length === 1 ? '' : 's'} winning</div>
                  </>
                )}
              </div>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Bids not streaming</div>
                {initialLoading ? <ViewsSpinner size={16} color={TEXT} /> : (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: TEXT }}>
                      {parseFloat(formatEther(ratePerSecToMonthly(notStreamingRate))).toFixed(3)} <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>ETH/mo</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 2 }}>{notStreaming.length} bid{notStreaming.length === 1 ? '' : 's'}</div>
                  </>
                )}
              </div>
            </div>

            {/* ── Your streams (hidden entirely once we know there's nothing to show) ── */}
            {(initialLoading || streams.length > 0) && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Your streams</div>
              {initialLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...Array(2)].map((_, i) => (
                    <div key={i} style={{ height: 52, borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(138,143,191,0.06)' }} />
                  ))}
                </div>
              ) : (
                <div style={{ borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  {streams.map((s, i) => (
                    <a
                      key={`${s.boardAddress}-${s.markeeAddress}`}
                      href={`/markee/${s.boardAddress}?strategy=streaming`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '11px 14px', textDecoration: 'none', color: 'inherit',
                        borderBottom: i === streams.length - 1 ? 'none' : `1px solid ${BORDER}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: s.isTop ? GREEN : MUTED, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                            {s.message || s.name || fmtAddr(s.markeeAddress)}
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 1 }}>
                            {s.isTop ? 'Winning' : 'Not winning'} · #{s.rank}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT, flexShrink: 0 }}>
                        {parseFloat(formatEther(ratePerSecToMonthly(BigInt(s.rateRaw)))).toFixed(3)}/mo
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
