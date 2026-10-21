'use client';
import { useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets, useFundWallet, useSendTransaction, useCreateWallet } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { formatEther, isHash, type Hex } from 'viem';
import type { Action, CheckoutStatus, Placement, PreparedAction } from '../../../../packages/sdk/src/types';

type Session = CheckoutStatus & { action: Extract<Action, { kind: 'create' | 'fund' }>; placement: Placement; name: string; origin: string; hash?: Hex };
class CheckoutError extends Error { constructor(message: string, public code: string) { super(message); } }
const pause = () => new Promise(resolve => setTimeout(resolve, 4000));
function explicitlyRejected(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 4001;
}

export default function Checkout({ id }: { id: string }) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { fundWallet } = useFundWallet();
  const { sendTransaction } = useSendTransaction();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('Loading checkout…');
  const [busy, setBusy] = useState(false);
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
    try { setRecoveryHash(sessionStorage.getItem(`${key}:hash`) || ''); } catch { /* Storage is optional. */ }
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
      setProgress('Complete card funding in the payment provider…');
      const funded = await fundWallet({ address: account, options: { chain: base, asset: 'native-currency', amount: formatEther(BigInt(funds.target) - BigInt(funds.balance)), defaultFundingMethod: 'card', uiConfig: { receiveFundsTitle: 'Fund your Markee payment' } } });
      if (funded.status === 'cancelled') throw new Error('Funding was closed. If you completed a card purchase, wait for the ETH to arrive, then continue here.');
      setProgress('Waiting for your ETH to arrive on Base…');
      for (let i = 0; i < 150 && alive.current; i++) {
        funds = await request('balance', { account });
        if (BigInt(funds.balance) >= BigInt(funds.target)) break;
        await pause();
      }
      if (BigInt(funds.balance) < BigInt(funds.target)) throw new Error('Funding is still pending. Continue here after ETH arrives; do not buy it again.');
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
      ({ hash } = await sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value), gasLimit: BigInt(tx.gas), chainId: tx.chainId, nonce }, { address: account, uiOptions: { showWalletUIs: true } }));
    } catch (e) {
      if (explicitlyRejected(e)) await request('rejected');
      else throw new Error('The wallet did not return a receipt. Payment may have been sent. Check your wallet activity and enter its transaction hash below; do not pay again.');
      throw new Error('Payment confirmation was declined. Your funds remain in your wallet.');
    }
    await verify(hash);
  }
  const pending = session && ['signing', 'submitted'].includes(session.status);
  const confirmed = session?.status === 'confirmed';
  const reverted = session?.status === 'reverted';
  const expired = session && Date.now() >= session.expiresAt && !pending && !confirmed && !reverted;
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
      {expired && <p role="alert">This checkout expired. Return to the app to start again. Any ETH you purchased remains in your wallet.</p>}
      {error && <p className="rounded-xl bg-red-500/10 p-4 text-red-200" role="alert">{error}</p>}
      {progress && <p role="status" aria-live="polite">{progress}</p>}
      {session && !confirmed && !reverted && !expired && !pending && <>
        <p className="text-sm text-gray-400">Card funding buys ETH for your wallet, then you confirm the Markee payment. Provider fees, purchase minimums and identity checks may apply. We allow 0.0001 ETH for network fees; any unused ETH stays yours.</p>
        {!authenticated ? <button className={button} disabled={!ready || busy} onClick={() => login({ loginMethods: ['email', 'google', 'apple'] })}>Sign in to continue</button> : !wallet ? <button className={button} disabled={!walletsReady || busy} onClick={() => void run(async () => { await createWallet(); })}>Set up my Markee wallet</button> : <button className={button} disabled={busy || !walletsReady} onClick={() => void run(pay)}>Continue with card or wallet balance</button>}
      </>}
      {pending && <section className="space-y-3"><p className="text-sm text-gray-400">Your payment is in progress. Checking it will never send another payment.</p><label className="block text-sm">Payment transaction hash<input className="mt-2 w-full rounded-lg border border-white/20 bg-black/20 p-3" value={recoveryHash || session.hash || ''} onChange={e => setRecoveryHash(e.target.value.trim())} placeholder="0x…" disabled={busy}/></label><button className={button} disabled={busy || !isHash(recoveryHash || session.hash || '')} onClick={() => void run(() => verify((recoveryHash || session.hash) as Hex))}>Check payment</button></section>}
      {session?.result && <a className="block text-purple-300 underline" href={session.result.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>}
      {session && <a className="block text-center text-gray-300 underline" href={session.origin}>Return to {new URL(session.origin).hostname}</a>}
    </div>
  </main>;
}
