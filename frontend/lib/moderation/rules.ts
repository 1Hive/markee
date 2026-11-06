import 'server-only'
import { domainToASCII, domainToUnicode } from 'node:url'
import { normalize } from 'viem/ens'

export interface RuleMatch { code: string; reason: string }
export const RULE_REASONS = {
  SECRET_REQUEST: 'This message asks for a wallet seed phrase or private key.',
  CLAIM_SOLICITATION: 'This message combines a reward claim with a link or wallet connection request.',
  PROMISED_RETURN: 'This message asks for a crypto payment and promises a multiplied return.',
  SHORTENED_LINK: 'This message contains a shortened link that conceals its destination.',
  DOMAIN_LOOKALIKE: 'This message contains a domain that resembles a protected service domain.',
  PAYMENT_SOLICITATION: 'This message includes payment instructions with a wallet address or ENS name.',
} as const

// Changes to these rules/data must bump AUTO_POLICY in automatic.ts.
// Centrally maintained policy data, not a claim to identify every shortener or phishing site.
const SHORTENERS = ['bit.ly', 't.co', 'tinyurl.com', 't.ly', 'is.gd', 'cutt.ly', 'rb.gy', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'ow.ly', 'buff.ly']
const PROTECTED = ['uniswap.org', 'metamask.io', 'coinbase.com', 'opensea.io', 'markee.xyz', 'gardens.fund']
const DOMAIN = /(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62}[\p{L}\p{N}])?\.)+[\p{L}]{2,63}/gu
const SECRET = /\b(?:seed\s+phrase|(?:secret\s+)?recovery\s+phrase|private\s+keys?|mnemonic(?:\s+phrase)?)\b/i
const REQUEST = /\b(?:send|share|provide|enter|paste|submit|type|dm|disclose|give|reveal|verify|requires?|need)\b/gi
const PAYMENT = /\b(?:send|pay|transfer|deposit|donate)\b/gi
const CRYPTO = /\b(?:eth|ether|ethereum|btc|bitcoin|usdc|usdt|crypto|tokens?)\b/i

// Compare a copy only; original on-chain text and its hash remain untouched.
export const ruleText = (text: string) => text.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ')
function negated(text: string, index: number) {
  return /(?:\bnever|\bnot|\bdon't|\bdo not|\bwill never ask you to|\bwill not ask you to)\s+(?:ever\s+)?$/i.test(text.slice(Math.max(0, index - 60), index))
}
function instruction(text: string, pattern: RegExp, target: (tail: string) => boolean) {
  return [...text.matchAll(pattern)].some(match => !negated(text, match.index!) && target(text.slice(match.index!, match.index! + 180)))
}
function ensTarget(text: string) {
  // ENS permits names (including emoji) that are not ordinary DNS hostnames.
  for (const match of text.matchAll(/(?:[\p{L}\p{N}\p{M}\p{Extended_Pictographic}\ufe0f\u200d_-]+\.)+eth\b/giu)) {
    try { normalize(match[0]); return true } catch { /* Invalid names are not validated ENS targets. */ }
  }
  return false
}
function paymentTarget(text: string) {
  return /\b0x[0-9a-f]{40}(?![0-9a-f])/i.test(text)
    || /\b0x[0-9a-f]{4,38}(?:\.{2,3}|…)[0-9a-f]{4,38}(?![0-9a-f])/i.test(text)
    || ensTarget(text)
}
const CONFUSABLES: Record<string, string> = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ѕ': 's', 'ӏ': 'l', 'ο': 'o' }
function brandLabel(label: string) {
  return label.toLowerCase().replace(/[аеорсуіхіѕӏο]/g, c => CONFUSABLES[c]).replace(/[01357]/g, c => ({ '0': 'o', '1': 'i', '3': 'e', '5': 's', '7': 't' })[c]!)
    .replace(/^(?:(?:app|www|login|support|claim|secure|wallet)-)+/, '')
}
function lookalike(host: string) {
  return PROTECTED.some(domain => {
    if (host === domain || host.endsWith(`.${domain}`)) return false
    const brand = domain.split('.')[0]
    return domainToUnicode(host).split('.').some(label => brandLabel(label) === brand)
  })
}

export function checkRules(message: string): RuleMatch[] {
  const text = ruleText(message)
  const matches = new Set<keyof typeof RULE_REASONS>()
  const hosts = [...text.matchAll(DOMAIN)].map(m => domainToASCII(m[0].toLowerCase())).filter(Boolean)
  for (const candidate of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    try {
      const url = new URL(candidate[0])
      hosts.push(url.hostname.toLowerCase().replace(/\.$/, ''))
      if (url.username && PROTECTED.some(domain => decodeURIComponent(url.username).toLowerCase().includes(domain))) matches.add('DOMAIN_LOOKALIKE')
    } catch { /* No network requests or redirect resolution. */ }
  }
  if (hosts.some(host => SHORTENERS.some(domain => host === domain || host.endsWith(`.${domain}`)))) matches.add('SHORTENED_LINK')
  if (hosts.some(lookalike)) matches.add('DOMAIN_LOOKALIKE')
  // Periods inside names, domains and amounts do not split an instruction.
  for (const clause of text.split(/[!?;]|\.(?:\s|$)/)) {
    if (instruction(clause, REQUEST, tail => SECRET.test(tail))) matches.add('SECRET_REQUEST')
    const asksPayment = instruction(clause, PAYMENT, tail => CRYPTO.test(tail) || paymentTarget(tail))
    if (asksPayment && /\b(?:2\s*x|[3-9]\s*x|double|triple|twice)\b/i.test(clause) && /\b(?:back|return|receive|get|earn)\b/i.test(clause)) matches.add('PROMISED_RETURN')
    if (instruction(clause, PAYMENT, paymentTarget)) matches.add('PAYMENT_SOLICITATION')
    const claim = instruction(clause, /\b(?:claim|redeem|collect|unlock)\b/gi, tail => /\b(?:airdrop|rewards?|tokens?|bonus|giveaway)\b/i.test(tail))
    if (claim && (/\b(?:connect|link|verify|sync)\s+(?:your\s+)?wallet\b/i.test(clause) || [...clause.matchAll(DOMAIN)].some(m => !m[0].toLowerCase().endsWith('.eth')))) matches.add('CLAIM_SOLICITATION')
  }
  return [...matches].map(code => ({ code, reason: RULE_REASONS[code] }))
}

/** Strict adds content restrictions, not a contextual safety classifier. */
export function checkStrictRules(message: string): RuleMatch[] {
  const text = ruleText(message)
  const matches: RuleMatch[] = []
  if (/https?:\/\/|www\./i.test(text) || [...text.matchAll(DOMAIN)].length) matches.push({ code: 'LINK', reason: 'This message contains a link or domain, which the strict preset hides.' })
  if (paymentTarget(text)) matches.push({ code: 'PAYMENT_ADDRESS', reason: 'This message contains a wallet address or ENS name, which the strict preset hides.' })
  return matches
}
