import { MarkeeError, type MarkeeClient } from './client.js';
import type { Action, CheckoutSession, CheckoutStatus, Placement, TransactionResult } from './types.js';

const storageKey = (client: MarkeeClient, placement: Placement) => `markee:checkout:v1:${client.apiUrl}:${JSON.stringify(placement)}`;
export function savedCheckout(client: MarkeeClient, placement: Placement): CheckoutSession | null {
  try { const data = JSON.parse(localStorage.getItem(storageKey(client, placement)) || 'null'); return data && typeof data.id === 'string' && /^[a-f0-9]{48}$/.test(data.id) && /^[a-f0-9]{64}$/.test(data.readToken) && /^[a-f0-9]{64}$/.test(data.writeToken) && Number.isFinite(data.expiresAt) ? data : null; } catch { return null; }
}
export async function checkoutStatus(client: MarkeeClient, session: CheckoutSession) {
  return client.request<CheckoutStatus>('checkout/status', { id: session.id, token: session.readToken });
}
export function forgetCheckout(client: MarkeeClient, placement: Placement) {
  try { localStorage.removeItem(storageKey(client, placement)); } catch { /* Storage may be disabled. */ }
}
/** Call directly from a click handler to preserve popup permission. */
export async function openHostedCheckout(client: MarkeeClient, placement: Placement, action: Action): Promise<TransactionResult> {
  const popup = window.open('about:blank', '_blank', 'popup,width=520,height=780');
  if (popup) popup.opener = null;
  let session = savedCheckout(client, placement);
  try {
    if (session) {
      const state = await checkoutStatus(client, session).catch(error => {
        if (error instanceof MarkeeError && error.status === 404) { forgetCheckout(client, placement); session = null; return null; }
        throw error;
      });
      if (state?.result?.status === 'confirmed' || state?.result?.status === 'reverted') {
        forgetCheckout(client, placement); popup?.close(); return state.result;
      }
      if (session && state && session.expiresAt < Date.now() && ['created', 'ready'].includes(state.status)) { forgetCheckout(client, placement); session = null; }
    }
    if (!session) {
      session = await client.request<CheckoutSession>('checkout/create', { placement, action, origin: window.location.origin });
      try { localStorage.setItem(storageKey(client, placement), JSON.stringify(session)); } catch { /* Popup still retains its own session. */ }
    }
    const url = new URL(`/checkout/${session.id}`, client.apiUrl);
    url.hash = new URLSearchParams({ token: session.writeToken }).toString();
    if (popup) popup.location.replace(url.href);
    else { window.location.assign(url.href); throw new Error('Continuing payment on Markee.'); }
    for (let i = 0; i < 1800; i++) {
      const state = await checkoutStatus(client, session);
      if (state.result && state.status === 'confirmed') { forgetCheckout(client, placement); return state.result; }
      if (state.status === 'reverted') { forgetCheckout(client, placement); throw new Error('Payment reverted. Any unspent funds remain in your Markee wallet.'); }
      if (popup.closed) throw new Error('Markee checkout closed. Choose Pay by card again to resume; funding alone does not complete payment.');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('Checkout is still pending. Reopen it to check the payment; do not pay again.');
  } catch (error) {
    // Keep existing checkout state for recovery. Never retry a payment automatically.
    if (!session) popup?.close();
    throw error;
  }
}
