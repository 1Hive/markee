'use client';
import { useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets, useFundWallet, useSendTransaction, useCreateWallet, useDepositFunds } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { formatEther, formatUnits, isHash, type Hex } from 'viem';
import type { Action, CheckoutStatus, Placement, PreparedAction } from '../../../../packages/sdk/src/types';

import type { ConversionQuote, ConversionStep } from '../../../lib/sdk/conversion';

type Session = CheckoutStatus & { action: Extract<Action, { kind: 'create' | 'fund' }>; placement: Placement; name: string; origin: string; funding?: 'stripe' | 'moonpay'; conversion?: ConversionStep; hash?: Hex };
class CheckoutError extends Error { constructor(message: string, public code: string) { super(message); } }
const pause = () => new Promise(resolve => setTimeout(resolve, 4000));
function explicitlyRejected(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 4001;
}

export default function Checkout({ id }: { id: string }) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { depositFunds } = useDepositFunds();
  const { fundWallet } = useFundWallet();
  const { sendTransaction } = useSendTransaction();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('Loading checkout…');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<'stripe' | 'moonpay'>('stripe');
  const [conversionHash, setConversionHash] = useState('');
  const [conversionReview, setConversionReview] = useState<ConversionStep | null>(null);
  const [fundingQuote, setFundingQuote] = useState<ConversionQuote | null>(null);
  const [recoveryHash, setRecoveryHash] = useState('');
  const token = useRef('');
  const running = useRef(false);
  const alive = useRef(true);
  const key = `markee:checkout:${id}`;
  const wallet = wallets.find(w => ['privy', 'privy-v2'].includes(w.walletClientType) && (!session?.account || w.address.toLowerCase() === session.account.toLowerCase()));

  async function request<T>(operation: string, values: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`/api/sdk/v1/checkout/${operation}`, { method: 'POST', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(25000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token: token.current, ...values }) });
    const body = await response.json();
    if (!response.ok) throw new CheckoutError(body.error || 'Checkout unavailable. Please retry.', body.code);
    return body as T;
  }
  async function refresh() {
    const current = await request<Session>('read');
    if (alive.current) setSession(current);
    return current;
  }
  useEffect(() => {
    alive.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (fragment && /^[a-f0-9]{64}$/.test(fragment)) {
      token.current = fragment;
      try { sessionStorage.setItem(key, fragment); } catch { /* The open page can still finish checkout. */ }
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      try { token.current = sessionStorage.getItem(key) || ''; } catch { /* Show recovery instructions below. */ }
    }
    if (!token.current) { setError('Reopen this checkout from the app where you started payment.'); setProgress(''); return; }
    try { setRecoveryHash(sessionStorage.getItem(`${key}:hash`) || ''); setConversionHash(sessionStorage.getItem(`${key}:conversion`) || ''); } catch { /* Storage is optional. */ }
    void refresh().then(() => { if (alive.current) setProgress(''); }).catch(e => { if (alive.current) { setError(e.message); setProgress(''); } });
    return () => { alive.current = false; };
    // A session is immutable; changing its ID remounts the checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function verify(hash: Hex) {
    setRecoveryHash(hash);
    try { sessionStorage.setItem(`${key}:hash`, hash); } catch { /* Server also retains accepted hashes. */ }
    setProgress('Confirming your payment on Base…');
    for (let i = 0; i < 150 && alive.current; i++) {
      try {
        const result = await request<CheckoutStatus>('verify', { hash });
        if (alive.current) setSession(previous => previous && { ...previous, ...result, hash });
        if (result.status === 'confirmed' || result.status === 'reverted') { setProgress(''); return; }
      } catch (e) {
        if (!(e instanceof CheckoutError) || !['TRANSACTION_PENDING', 'CHECKOUT_BUSY', 'REQUEST_FAILED', 'RATE_LIMITED'].includes(e.code)) throw e;
      }
      await pause();
    }
    throw new Error('Payment is still pending. Check its status here before making another payment.');
  }
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : 'Unable to continue checkout.'); setProgress(''); } }
    finally { running.current = false; if (alive.current) { setBusy(false); await refresh().catch(() => {}); } }
  }
  async function pay() {
    if (!wallet || !session) return;
    const current = await refresh();
    if (!['created', 'ready'].includes(current.status)) throw new Error('Check the existing payment below before continuing.');
    const account = wallet.address;
    setProgress('Checking your wallet balance…');
    let funds = await request<{ balance: string; target: string }>('balance', { account });
    if (BigInt(funds.balance) < BigInt(funds.target)) {
      const selected = current.funding || provider;
      let minimumUsdc = 0n;
      if (selected === 'stripe') {
        const quote = await request<ConversionQuote>('conversion-quote');
        setFundingQuote(quote);
        minimumUsdc = BigInt(quote.usdcMaximum) - BigInt(quote.usdcBalance);
        if (BigInt(quote.usdcBalance) >= BigInt(quote.usdcMaximum)) {
          const step = await request<ConversionStep>('conversion-prepare');
          setConversionReview(step); setProgress('Review the conversion below.'); return;
        }
      }
      if (current.funding) throw new Error('Your card funding was already opened. Check for arriving funds, or confirm below that no purchase is pending before opening it again.');
      await request('funding-start', { provider: selected });
      setProgress('Complete card funding in the payment provider…');
      if (selected === 'stripe') {
        // Provider preference is not a guarantee: Privy shows eligible alternatives before purchase.
        await depositFunds({ destination: { asset: 'usdc', chain: 'eip155:8453', wallet: account }, fiat: { environment: 'production', preferredProvider: 'stripe', source: { defaultAsset: 'usd' }, defaultAmount: formatUnits(((minimumUsdc + 9999n) / 10000n) * 10000n, 6) } });
      } else {
        const funded = await fundWallet({ address: account, options: { chain: base, asset: 'native-currency', amount: formatEther(BigInt(funds.target) - BigInt(funds.balance)), defaultFundingMethod: 'card', card: { preferredProvider: 'moonpay' }, uiConfig: { receiveFundsTitle: 'Fund your Markee payment' } } });
        if (funded.status === 'cancelled') throw new Error('Funding was closed. Check whether a purchase is pending before trying again.');
      }
      setProgress('Waiting for funds to arrive on Base…');
      for (let i = 0; i < 150 && alive.current; i++) {
        funds = await request('balance', { account });
        if (BigInt(funds.balance) >= BigInt(funds.target)) break;
        if (selected === 'stripe') {
          const quote = await request<ConversionQuote>('conversion-quote');
          setFundingQuote(quote);
          if (BigInt(quote.usdcBalance) >= BigInt(quote.usdcMaximum)) {
            setConversionReview(await request<ConversionStep>('conversion-prepare'));
            setProgress('Review the conversion below.'); return;
          }
        }
        await pause();
      }
      if (BigInt(funds.balance) < BigInt(funds.target)) throw new Error('Funding is still pending or below the required amount. Check your existing purchase before buying again.');
    }
    if (!alive.current) return;
    setProgress('Preparing your Markee payment…');
    await wallet.switchChain(base.id);
    const preparation = await request<PreparedAction>('prepare', { account });
    const { nonce } = await request<{ nonce: number }>('arm', { preparationId: preparation.id });
    setSession(previous => previous && { ...previous, status: 'signing', account: account as Hex });
    setProgress('Confirm the Markee payment in your wallet…');
    let hash: Hex;
    try {
      const tx = preparation.transaction;
      ({ hash } = await sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value), gasLimit: BigInt(tx.gas), chainId: tx.chainId, nonce }, { address: account, sponsor: false, uiOptions: { showWalletUIs: true } }));
    } catch (e) {
      if (explicitlyRejected(e)) await request('rejected');
      else throw new Error('The wallet did not return a receipt. Payment may have been sent. Check your wallet activity and enter its transaction hash below; do not pay again.');
      throw new Error('Payment confirmation was declined. Your funds remain in your wallet.');
    }
    await verify(hash);
  }
  async function verifyConversion(hash: Hex) {
    setConversionHash(hash);
    try { sessionStorage.setItem(`${key}:conversion`, hash); } catch { /* Server retains accepted hashes too. */ }
    setProgress('Confirming conversion on Base…');
    for (let i = 0; i < 150 && alive.current; i++) {
      try {
        const step = await request<ConversionStep>('conversion-verify', { hash });
        if (step.status === 'reverted') throw new Error('Conversion reverted. Your unspent funds remain in your wallet. Continue to get a new quote.');
        if (step.status === 'confirmed') {
          setConversionHash(''); setConversionReview(null);
          try { sessionStorage.removeItem(`${key}:conversion`); } catch { /* Optional storage. */ }
          await refresh();
          await pay(); return;
        }
      } catch (e) {
        if (!(e instanceof CheckoutError) || !['TRANSACTION_PENDING', 'CHECKOUT_BUSY', 'REQUEST_FAILED', 'RATE_LIMITED'].includes(e.code)) throw e;
      }
      await pause();
    }
    throw new Error('Conversion is still pending. Check its transaction below before continuing.');
  }
  async function convert() {
    if (!wallet || !conversionReview) return;
    await wallet.switchChain(base.id);
    await request('conversion-arm', { stepId: conversionReview.id });
    const tx = conversionReview.transaction;
    setConversionReview(null);
    setProgress('Confirm the conversion step in your wallet…');
    let hash: Hex;
    try {
      ({ hash } = await sendTransaction({ to: tx.to, data: tx.data, value: 0n, chainId: 8453 }, { address: wallet.address, sponsor: true, uiOptions: { showWalletUIs: true } }));
    } catch (e) {
      if (explicitlyRejected(e)) { await request('conversion-rejected'); throw new Error('Conversion declined. Your funds remain in your wallet.'); }
      throw new Error('Conversion may have been sent. Check your wallet activity and enter its transaction hash below.');
    }
    await verifyConversion(hash);
  }
  const conversionPending = session?.conversion && ['signing', 'submitted'].includes(session.conversion.status);
  const pending = session && ['signing', 'submitted'].includes(session.status);
  const confirmed = session?.status === 'confirmed';
  const reverted = session?.status === 'reverted';
  const expired = session && Date.now() >= session.expiresAt && !pending && !conversionPending && !confirmed && !reverted;
  const button = 'w-full rounded-xl bg-purple-500 px-5 py-3 font-semibold text-white disabled:opacity-50';
  return <main className="mx-auto min-h-[75vh] max-w-xl px-5 py-12">
    <div className="rounded-2xl border border-white/15 bg-white/5 p-6 space-y-6">
      <div><p className="text-sm text-purple-300">Secure checkout · Base</p><h1 className="mt-2 text-2xl font-bold">{confirmed ? 'Payment complete' : 'Pay with Markee'}</h1><p className="mt-1 text-gray-400">{session?.name}</p></div>
      {session && <section className="rounded-xl bg-black/20 p-4 space-y-3">
        <p className="text-2xl font-semibold">{formatEther(BigInt(session.action.amount!))} ETH</p>
        <p className="whitespace-pre-wrap break-words">{session.action.kind === 'create' ? session.action.message : 'Fund the selected Markee message'}</p>
        <p className="text-sm text-gray-400">{session.action.kind === 'fund' ? 'The current message owner stays the same. ' : ''}MARKEE rewards go directly to your Markee wallet when payment confirms.</p>
      </section>}
      {(wallet || session?.account) && <section className="text-sm"><p className="text-gray-400">Your payment and rewards wallet</p><p className="mt-1 break-all font-mono">{session?.account || wallet?.address}</p></section>}
      {confirmed && <section className="rounded-xl bg-green-500/10 p-4 text-green-200" role="status"><p>Markee has verified your payment.</p><p className="mt-2">{session.result?.tokensReceived !== undefined ? `${formatEther(BigInt(session.result.tokensReceived))} MARKEE received in your wallet.` : 'Check your transaction receipt for the rewards delivered.'}</p></section>}
      {reverted && <p role="alert">Payment reverted. Unspent ETH remains in your wallet. Return to the app to start again.</p>}
      {expired && <p role="alert">This checkout expired. Return to the app to start again. Any funds you purchased remain in your wallet.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-4 text-red-200" role="alert">{error}</p>}
      {progress && <p role="status" aria-live="polite">{progress}</p>}
      {session && !confirmed && !reverted && !expired && !pending && !conversionPending && <>
        <p className="text-sm text-gray-400">Stripe funding buys Base USDC, which is converted to ETH before the Markee payment. MoonPay can fund Base ETH directly. Conversion allows at most 1% slippage; unused funds stay in your wallet. Provider fees, purchase minimums and identity checks may apply. We allow 0.0001 ETH for network fees; any unused ETH stays yours.</p>
        <label className="block text-sm">Funding route<select className="mt-2 w-full rounded-lg border border-white/20 bg-gray-900 p-3" value={session.funding || provider} disabled={busy || !!session.funding} onChange={e => setProvider(e.target.value as 'stripe' | 'moonpay')}><option value="stripe">Stripe · USDC to ETH (eligible alternatives available)</option><option value="moonpay">MoonPay · ETH directly</option></select></label>
        {fundingQuote && <p className="text-sm">Conversion currently needs up to {formatUnits(BigInt(fundingQuote.usdcMaximum), 6)} USDC. Provider fees and minimums are additional; check the amount you will receive.</p>}
        {session.funding && <button className="text-sm underline" disabled={busy} onClick={() => { if (window.confirm('Have you checked the provider and confirmed that no purchase is pending? Opening funding again could create another charge.')) void run(async () => { await request('funding-reset', { confirmNoPendingPurchase: true }); }); }}>No purchase is pending — choose funding again</button>}
        {conversionReview && <section className="rounded-xl border border-purple-400 p-4 space-y-3"><p>{conversionReview.kind === 'approval' ? 'Approve a capped USDC allowance' : 'Convert USDC to ETH'}</p><p>Maximum {formatUnits(BigInt(conversionReview.quote.usdcMaximum), 6)} USDC for {formatEther(BigInt(conversionReview.quote.eth))} ETH. Markee sponsors the conversion network fees.</p><button className={button} disabled={busy} onClick={() => void run(convert)}>Confirm {conversionReview.kind === 'approval' ? 'USDC allowance' : 'conversion'}</button></section>}
        {!ready || !walletsReady ? <p role="status">Restoring your Markee session…</p> : !authenticated ? <button className={button} disabled={!ready || busy} onClick={() => login({ loginMethods: ['email', 'google', 'apple'] })}>Sign in to continue</button> : !wallet ? <button className={button} disabled={!walletsReady || busy} onClick={() => void run(async () => { await createWallet(); })}>Set up my Markee wallet</button> : <button className={button} disabled={busy || !walletsReady} onClick={() => void run(pay)}>{session.funding ? 'Check funds and continue' : 'Continue with card or wallet balance'}</button>}
      </>}
      {conversionPending && <section className="space-y-3"><p>Check the existing conversion before continuing.</p><label className="block text-sm">Conversion transaction hash<input className="mt-2 w-full rounded-lg border border-white/20 bg-black/20 p-3" value={conversionHash || session?.conversion?.hash || ''} onChange={e => setConversionHash(e.target.value.trim())} placeholder="0x…" disabled={busy}/></label><button className={button} disabled={busy || !isHash(conversionHash || session?.conversion?.hash || '')} onClick={() => void run(() => verifyConversion((conversionHash || session?.conversion?.hash) as Hex))}>Check conversion</button></section>}
      {pending && <section className="space-y-3"><p className="text-sm text-gray-400">Your payment is in progress. Checking it will never send another payment.</p><label className="block text-sm">Payment transaction hash<input className="mt-2 w-full rounded-lg border border-white/20 bg-black/20 p-3" value={recoveryHash || session.hash || ''} onChange={e => setRecoveryHash(e.target.value.trim())} placeholder="0x…" disabled={busy}/></label><button className={button} disabled={busy || !isHash(recoveryHash || session.hash || '')} onClick={() => void run(() => verify((recoveryHash || session.hash) as Hex))}>Check payment</button></section>}
      {session?.result && <a className="block text-purple-300 underline" href={session.result.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>}
      {session && <a className="block text-center text-gray-300 underline" href={session.origin}>Return to {new URL(session.origin).hostname}</a>}
    </div>
  </main>;
}
