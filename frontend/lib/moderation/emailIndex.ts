export const EMAIL_IN_USE_ERROR = 'Email already in use'
export const UNVERIFIED_CLAIM_TTL = 60 * 60 * 24 * 7

export const normalizeNotifyEmail = (email: string) => email.trim().toLowerCase()
export const notifyEmailIndexKey = (email: string) => `moderation:notify-email:${normalizeNotifyEmail(email)}`

export const IN_FLIGHT_TTL = 30

export interface EmailIndexStore {
  claim(key: string, wallet: string, ttlSeconds: number | null): Promise<string>
  releaseIfHeld(key: string, wallet: string): Promise<void>
  /** Atomically drops `holder`'s claim on `email` unless the holder is mid-change or its state still names the email. */
  evictIfStale(key: string, holder: string, email: string): Promise<boolean>
  markInFlight(wallet: string): Promise<void>
  clearInFlight(wallet: string): Promise<void>
}

export type ClaimResult = { ok: true } | { ok: false; holder: string }

export async function claimNotifyEmail(
  store: EmailIndexStore,
  email: string,
  rawWallet: string,
  { verified }: { verified: boolean },
): Promise<ClaimResult> {
  const wallet = rawWallet.toLowerCase()
  const normalized = normalizeNotifyEmail(email)
  const key = notifyEmailIndexKey(normalized)
  const ttl = verified ? null : UNVERIFIED_CLAIM_TTL
  for (let attempt = 0; attempt < 2; attempt++) {
    const holder = await store.claim(key, wallet, ttl)
    if (holder === wallet) return { ok: true }
    if (!await store.evictIfStale(key, holder, normalized)) return { ok: false, holder }
  }
  return { ok: false, holder: '' }
}

// While the wallet's state and its index entries disagree (old email kept, new one being claimed),
// the in-flight marker stops concurrent claimants from evicting either of its claims as stale.
export async function assignNotifyEmail(
  store: EmailIndexStore,
  email: string,
  wallet: string,
  { writeState, restoreState }: { writeState: () => Promise<unknown>; restoreState: () => Promise<unknown> },
): Promise<ClaimResult> {
  await store.markInFlight(wallet)
  try {
    await writeState()
    const claim = await claimNotifyEmail(store, email, wallet, { verified: false })
    if (!claim.ok) await restoreState()
    return claim
  } finally {
    await store.clearInFlight(wallet)
  }
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
