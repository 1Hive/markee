import { underRateLimit } from '../rate-limit'

export const emailThrottleDeps = { underRateLimit }

export const VERIFY_EMAIL_LIMITS = {
  perIp: { max: 10, windowSeconds: 3600 },
  perWallet: { max: 1, windowSeconds: 60 },
  perRecipient: { max: 5, windowSeconds: 3600 },
} as const

export async function verifyEmailIpAllowed(ip: string): Promise<boolean> {
  const { max, windowSeconds } = VERIFY_EMAIL_LIMITS.perIp
  return emailThrottleDeps.underRateLimit('verify-email-ip', ip, max, windowSeconds)
}

export async function verifyEmailRecipientAllowed(email: string): Promise<boolean> {
  const { max, windowSeconds } = VERIFY_EMAIL_LIMITS.perRecipient
  return emailThrottleDeps.underRateLimit('verify-email-recipient', email.toLowerCase(), max, windowSeconds)
}

export async function verifyEmailWalletAllowed(wallet: string): Promise<boolean> {
  const { max, windowSeconds } = VERIFY_EMAIL_LIMITS.perWallet
  return emailThrottleDeps.underRateLimit('verify-email-wallet', wallet.toLowerCase(), max, windowSeconds)
}
