'use client'

import { useEffect, useState } from 'react'
import { useFundWallet } from '@privy-io/react-auth'
import { base } from 'viem/chains'
import { formatEther, parseEther } from 'viem'
import { PINK, TEXT2, BORDER } from '@/lib/design-tokens'

/** Fund the stream owner's wallet; wrapping/deposit remains an explicit existing wallet action. */
export function CardDeposit({ address, amount, onRefresh }: { address: `0x${string}`; amount: string; onRefresh: () => void }) {
  const { fundWallet } = useFundWallet()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const key = `markee:card-deposit:${address.toLowerCase()}`
  useEffect(() => { try { setPending(sessionStorage.getItem(key) === 'pending') } catch { /* Optional storage. */ } }, [key])
  async function fund() {
    if (busy || pending) return
    setError('')
    try {
      const value = parseEther(amount)
      if (value <= 0n) throw new Error('Enter a deposit amount first.')
      setBusy(true); setPending(true)
      try { sessionStorage.setItem(key, 'pending') } catch { /* Keep the local guard. */ }
      await fundWallet({ address, options: { chain: base, asset: 'native-currency', amount: formatEther(value), defaultFundingMethod: 'card', card: { preferredProvider: 'moonpay' }, uiConfig: { receiveFundsTitle: 'Fund your rental deposit' } } })
      onRefresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to open card funding.') }
    finally { setBusy(false) }
  }
  return <section style={{ padding: 14, border: `1px solid ${BORDER}`, borderRadius: 10, display: 'grid', gap: 10 }}>
    <strong>Add funds by card</strong>
    <p style={{ color: TEXT2, fontSize: 12 }}>Buy ETH on Base for this wallet, then confirm Deposit above to turn it into ETHx. This is a one-time top-up, not a recurring card subscription. Provider fees and minimums apply.</p>
    <p style={{ color: TEXT2, fontSize: 11, overflowWrap: 'anywhere' }}>Rental wallet: {address}</p>
    <p style={{ color: TEXT2, fontSize: 12 }}>MoonPay is preferred where available; Privy may offer another eligible provider. Card funding itself does not earn MARKEE rewards.</p>
    {error && <p role="alert" style={{ color: '#FF8E8E' }}>{error}</p>}
    {pending ? <>
      <p role="status" style={{ fontSize: 12 }}>Check your card purchase and refresh your balance before depositing. Funds may still be arriving.</p>
      <button disabled={busy} onClick={onRefresh} style={{ color: PINK }}>Refresh wallet balance</button>
      <button disabled={busy} style={{ color: TEXT2, fontSize: 11 }} onClick={() => { if (window.confirm('Have you confirmed that the previous card purchase is complete or cancelled, with no purchase pending?')) { setPending(false); try { sessionStorage.removeItem(key) } catch { /* Optional storage. */ } } }}>Previous purchase resolved — allow another top-up</button>
    </> : <button disabled={busy} onClick={() => void fund()} style={{ color: PINK, fontWeight: 700 }}>{busy ? 'Opening card funding…' : 'Buy ETH by card'}</button>}
  </section>
}
