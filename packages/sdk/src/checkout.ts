import { storageOrigins } from './storage-origins.js';
import { MarkeeError, MarkeeClient } from './client.js';
import type { Action, CheckoutSession, CheckoutStatus, Placement, TransactionResult } from './types.js';

const sources = new WeakMap<CheckoutSession, string>();
const storageKey = (client: MarkeeClient, placement: Placement, origin = client.apiUrl) => `markee:checkout:v1:${origin}:${JSON.stringify(placement)}`;
export function savedCheckout(client: MarkeeClient, placement: Placement): CheckoutSession | null {
  for (const origin of storageOrigins(client.apiUrl)) {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey(client, placement, origin)) || 'null');
      if (data && typeof data.id === 'string' && /^[a-f0-9]{48}$/.test(data.id) && /^[a-f0-9]{64}$/.test(data.readToken) && /^[a-f0-9]{64}$/.test(data.writeToken) && Number.isFinite(data.expiresAt)) {
        sources.set(data, origin); return data;
      }
    } catch { /* Keep other known API recovery records discoverable. */ }
  }
  return null;
}
export async function checkoutStatus(client: MarkeeClient, session: CheckoutSession) {
  const origin = sources.get(session) || client.apiUrl;
  const recovery = origin === client.apiUrl ? client : new MarkeeClient({ ...client.options, apiUrl: origin });
  return recovery.request<CheckoutStatus>('checkout/status', { id: session.id, token: session.readToken });
}
export function forgetCheckout(client: MarkeeClient, placement: Placement, session = savedCheckout(client, placement)) {
  try { localStorage.removeItem(storageKey(client, placement, session ? sources.get(session) || client.apiUrl : client.apiUrl)); } catch { /* Storage may be disabled. */ }
}

/** Call directly from a click handler to preserve popup permission. */
export async function openHostedCheckout(client: MarkeeClient, placement: Placement, action: Action): Promise<TransactionResult> {
  const popup = client.options.checkoutWindow === 'redirect' ? null : window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  let session = savedCheckout(client, placement);
  try {
    let recovered = 0;
    while (session && recovered++ < storageOrigins(client.apiUrl).length) {
      const state = await checkoutStatus(client, session).catch(error => {
        if (error instanceof MarkeeError && error.status === 404) throw new MarkeeError('The saved checkout could not be found. Do not fund another checkout; contact Markee support.', 'CHECKOUT_RECOVERY_REQUIRED', 404);
        throw error;
      });
      if (state?.result?.status === 'confirmed' || state?.result?.status === 'reverted') {
        forgetCheckout(client, placement, session); popup?.close(); return state.result;
      }
      if (session && state && session.expiresAt < Date.now() && ['created', 'ready'].includes(state.status)) { forgetCheckout(client, placement, session); session = savedCheckout(client, placement); continue; }
      break;
    }
    if (!session) {
      session = await client.request<CheckoutSession>('checkout/create', { placement, action, origin: window.location.origin, ...(client.options.moderation?.severity ? { severity: client.options.moderation.severity } : {}) });
      try { localStorage.setItem(storageKey(client, placement), JSON.stringify(session)); } catch { /* Popup still retains its own session. */ }
    }
    const url = new URL(`/checkout/${session.id}`, session.checkoutOrigin || sources.get(session) || client.apiUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Invalid Markee checkout destination.');
    url.hash = new URLSearchParams({ token: session.writeToken }).toString();
    if (popup) popup.location.replace(url.href);
    else { window.location.assign(url.href); throw new Error('Continuing payment on Markee.'); }
    for (let i = 0; i < 1800; i++) {
      const state = await checkoutStatus(client, session);
      if (state.result && state.status === 'confirmed') { forgetCheckout(client, placement, session); popup.close(); return state.result; }
      if (state.status === 'reverted') { forgetCheckout(client, placement, session); throw new Error('Payment reverted. Any unspent funds remain in your Markee wallet.'); }
      if (popup.closed) throw new Error('Markee checkout closed. Choose Pay again to resume; funding alone does not complete payment.');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('Checkout is still pending. Reopen it to check the payment; do not pay again.');
  } catch (error) {
    // Keep existing checkout state for recovery. Never retry a payment automatically.
    if (!session) popup?.close();
    throw error;
  }
}
