'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd, formatMarkeeAmount } from '@/lib/utils'
import { estimateLeaderboardPurchaseMarkeeTokens } from '@/lib/tokenPhases'
import { parseEther } from 'viem'
import type { CheckoutSession } from '../../../packages/sdk/src/types'
import { PINK, BG, BORDER, TEXT2, MONO } from '@/lib/design-tokens'

const Checkout = dynamic(() => import('./Checkout'), { ssr: false, loading: () => <p>Loading secure checkout…</p> })
export type PaymentMethod = 'wallet' | 'card'
export function PaymentMethodChoice({ value, onChange, disabled = false }: { value: PaymentMethod; onChange: (value: PaymentMethod) => void; disabled?: boolean }) {
  return <div role="group" aria-label="Payment method" style={{ display: 'flex', gap: 8, padding: '12px 22px', borderBottom: `1px solid ${BORDER}` }}>
    {(['wallet', 'card'] as const).map(method => <button key={method} type="button" aria-pressed={value === method} disabled={disabled} onClick={() => onChange(method)} style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: `1px solid ${value === method ? PINK : BORDER}`, color: value === method ? PINK : TEXT2, background: value === method ? 'rgba(248,151,254,0.1)' : 'transparent', fontFamily: MONO, cursor: 'pointer' }}>{method === 'wallet' ? 'Wallet' : 'Pay by card'}</button>)}
  </div>
}

export function CardPayment({ board, amount, message, name, markee, onBack, onComplete }: { board: string; amount: string; message: string; name: string; markee?: string; onBack: () => void; onComplete?: () => void }) {
  const ethPrice = useEthPrice()
  const numericAmount = Number(amount)
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0
  const [session, setSession] = useState<CheckoutSession | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function start() {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try {
      const wei = parseEther(amount)
      if (wei <= 0n) throw new Error('Enter a positive payment amount.')
      if (!markee && !message.trim()) throw new Error('Enter your message before continuing.')
      const action = markee ? { kind: 'fund', markee, amount: wei.toString() } : { kind: 'create', message, name: name.trim(), amount: wei.toString() }
      const body = { placement: { kind: 'board', address: board, chainId: 8453 }, action }
      const storageKey = `markee:in-app-checkout:${JSON.stringify(body)}`
      // Recover the exact intent after closing/reopening; never automatically start a second purchase.
      let saved: CheckoutSession | null = null
      try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { /* Storage is optional. */ }
      if (saved?.id && saved.writeToken) { setSession(saved); return }
      const response = await fetch('/api/sdk/v1/checkout/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Card checkout is unavailable. Please try again later.')
      try { sessionStorage.setItem(storageKey, JSON.stringify(result)) } catch { /* The mounted checkout retains its capability. */ }
      setSession(result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start checkout.') }
    finally { running.current = false; setBusy(false) }
  }
  if (session) return <Checkout key={session.id} id={session.id} capability={session.writeToken} embedded onComplete={onComplete} />
  return <section style={{ display: 'grid', gap: 16 }}>
    <button onClick={onBack} disabled={busy} style={{ color: PINK, textAlign: 'left' }}>← Back to message</button>
    <h2 style={{ fontSize: 22, fontWeight: 700 }}>Review card payment</h2>
    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message || 'Fund the selected message'}</p>
    <p style={{ fontSize: 24 }}>{amount || '0'} ETH</p>
    {validAmount && <p style={{ color: TEXT2 }}>{ethPrice ? `Approximately ${formatUsd(numericAmount * ethPrice)} before fees · ` : ''}Estimated {formatMarkeeAmount(estimateLeaderboardPurchaseMarkeeTokens(numericAmount))} MARKEE rewards</p>}
    <p style={{ color: TEXT2 }}>Your contribution is paid in ETH on Base. Card fees, purchase minimums and any conversion are shown before confirmation.</p>
    <p style={{ color: TEXT2 }}>Your Markee wallet will make the payment and receive the MARKEE rewards. Its address appears before funding. This can differ from your connected wallet.</p>
    {error && <p role="alert" style={{ color: '#FF8E8E' }}>{error}</p>}
    <button disabled={busy} onClick={() => void start()} style={{ padding: 14, background: PINK, color: BG, borderRadius: 10, fontWeight: 700 }}>{busy ? 'Preparing checkout…' : 'Continue to secure checkout'}</button>
  </section>
}
