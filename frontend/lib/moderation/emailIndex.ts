export const EMAIL_IN_USE_ERROR = 'Email already in use'
export const UNVERIFIED_CLAIM_TTL = 60 * 60 * 24 * 7

export const normalizeNotifyEmail = (email: string) => email.trim().toLowerCase()
export const notifyEmailIndexKey = (email: string) => `moderation:notify-email:${normalizeNotifyEmail(email)}`

export interface EmailIndexStore {
  claim(key: string, wallet: string, ttlSeconds: number | null): Promise<string>
  releaseIfHeld(key: string, wallet: string): Promise<void>
  currentEmail(wallet: string): Promise<string | null>
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
    const holderEmail = await store.currentEmail(holder)
    if (holderEmail && normalizeNotifyEmail(holderEmail) === normalized) return { ok: false, holder }
    await store.releaseIfHeld(key, holder)
  }
  return { ok: false, holder: '' }
}

// The wallet's state must name the email before the claim: claimNotifyEmail treats a holder whose
// state lacks the email as stale, so claiming first lets a concurrent claimant evict the new claim.
export async function assignNotifyEmail(
  store: EmailIndexStore,
  email: string,
  wallet: string,
  { writeState, restoreState }: { writeState: () => Promise<unknown>; restoreState: () => Promise<unknown> },
): Promise<ClaimResult> {
  await writeState()
  const claim = await claimNotifyEmail(store, email, wallet, { verified: false })
  if (!claim.ok) await restoreState()
  return claim
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
