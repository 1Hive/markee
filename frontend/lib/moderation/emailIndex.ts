export const EMAIL_IN_USE_ERROR = 'This email has already been verified by another user'

export const normalizeNotifyEmail = (email: string) => email.trim().toLowerCase()
export const notifyEmailIndexKey = (email: string) => `moderation:notify-email:${normalizeNotifyEmail(email)}`

// The index holds verified emails only. Saving an email reserves nothing: any number of wallets can
// have the same address pending, and whichever verifies first takes it. Later verifications, and
// saves of an address someone has already verified, are refused.
export interface EmailIndexStore {
  claim(key: string, wallet: string): Promise<string>
  holder(key: string): Promise<string | null>
  releaseIfHeld(key: string, wallet: string): Promise<void>
  /** Atomically drops `holder`'s claim on `email` unless its state still has that email verified. */
  evictIfStale(key: string, holder: string, email: string): Promise<boolean>
}

export type ClaimResult = { ok: true } | { ok: false; holder: string }

// Called once the wallet has proven it receives mail at `email`.
export async function claimNotifyEmail(store: EmailIndexStore, email: string, rawWallet: string): Promise<ClaimResult> {
  const wallet = rawWallet.toLowerCase()
  const normalized = normalizeNotifyEmail(email)
  const key = notifyEmailIndexKey(normalized)
  for (let attempt = 0; attempt < 2; attempt++) {
    const holder = await store.claim(key, wallet)
    if (holder === wallet) return { ok: true }
    if (!await store.evictIfStale(key, holder, normalized)) return { ok: false, holder }
  }
  return { ok: false, holder: '' }
}

// The other wallet that has verified `email`, if any.
export async function verifiedHolder(store: EmailIndexStore, email: string, rawWallet: string): Promise<string | null> {
  const wallet = rawWallet.toLowerCase()
  const normalized = normalizeNotifyEmail(email)
  const key = notifyEmailIndexKey(normalized)
  const holder = await store.holder(key)
  if (!holder || holder === wallet) return null
  return await store.evictIfStale(key, holder, normalized) ? null : holder
}

export async function releaseNotifyEmail(
  store: EmailIndexStore,
  email: string | null | undefined,
  wallet: string,
  replacement?: string,
) {
  if (!email) return
  if (replacement && normalizeNotifyEmail(replacement) === normalizeNotifyEmail(email)) return
  await store.releaseIfHeld(notifyEmailIndexKey(email), wallet.toLowerCase())
}

// Saves a new, unverified email for `wallet` and releases the one it replaces. Refused only when
// another wallet has already verified the address.
export async function setNotifyEmail(
  store: EmailIndexStore,
  email: string,
  wallet: string,
  { previous, writeState }: { previous: string | null | undefined; writeState: () => Promise<unknown> },
): Promise<ClaimResult> {
  const holder = await verifiedHolder(store, email, wallet)
  if (holder) return { ok: false, holder }
  await writeState()
  await releaseNotifyEmail(store, previous, wallet, email)
  return { ok: true }
}
