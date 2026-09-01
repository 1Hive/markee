const USER_REJECTED_PATTERNS = [
  'user rejected',
  'user denied',
  'rejected the request',
  'request rejected',
  'denied transaction',
  'userrejectedrequesterror',
  'code: 4001',
  '"code":4001',
  '"code": 4001',
]

const NOISY_TRANSACTION_PATTERNS = [
  'request arguments:',
  'contract call:',
  'raw call arguments:',
  'function:',
  'docs:',
  'details:',
  'version:',
  'abi',
  'decode',
  'encoding',
  'contractfunctionexecutionerror',
  'call_execution',
  'callexecutionerror',
]

// Known 4-byte revert selectors → user-facing messages.
// StreamingLeaderboard custom errors and Superfluid CFA/GDA errors we've seen in the wild.
const KNOWN_SELECTORS: Record<string, string> = {
  '0x26d016f2': 'Stream rate is below this board\'s minimum. Try a slightly higher amount.',
  '0x0e1eddda': 'Deposit is too small for this stream rate. This is likely a bug — please contact support.',
  '0x6663ccf3': 'Markee not registered on this board. Try creating your Markee again.',
  '0x801b6863': 'You already have an active stream to this board. Stop it from your account page first.',
  '0x0dc149f0': 'Board already initialized.',
  '0xed3ba6a6': 'Reentrancy detected — please try again.',
  '0x56316e87': 'Zero deposit amount.',
}

// Walk the error and cause chain looking for a `data` hex string starting with a known selector.
function extractKnownSelector(error: unknown): string | null {
  const visited = new Set<unknown>()
  const queue: unknown[] = [error]
  while (queue.length) {
    const e = queue.shift()
    if (!e || typeof e !== 'object' || visited.has(e)) continue
    visited.add(e)
    const obj = e as Record<string, unknown>

    const data = obj.data
    if (typeof data === 'string' && /^0x[0-9a-fA-F]{8}/i.test(data)) {
      const sel = data.slice(0, 10).toLowerCase()
      if (KNOWN_SELECTORS[sel]) return KNOWN_SELECTORS[sel]
    }
    if (obj.cause) queue.push(obj.cause)
    if (obj.error) queue.push(obj.error)
  }
  return null
}

function errorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function shortText(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const maybeShort = (error as { shortMessage?: unknown }).shortMessage
  return typeof maybeShort === 'string' ? maybeShort : ''
}

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase()
  return patterns.some(pattern => lower.includes(pattern))
}

function isDisplayableMessage(text: string): boolean {
  return !!text && text.length <= 180 && !matchesAny(text, NOISY_TRANSACTION_PATTERNS)
}

export function formatTransactionError(error: unknown): string {
  const known = extractKnownSelector(error)
  if (known) return known

  const raw = errorText(error)
  const short = shortText(error)
  const combined = `${short}\n${raw}`

  if (matchesAny(combined, USER_REJECTED_PATTERNS)) {
    return 'Transaction rejected'
  }

  if (matchesAny(raw, NOISY_TRANSACTION_PATTERNS)) {
    if (isDisplayableMessage(short)) return short
    return 'Transaction error'
  }

  const candidate = short || raw
  if (!isDisplayableMessage(candidate)) return 'Transaction error'
  return candidate
}

export function logTransactionError(error: unknown, context: string): void {
  if (!error) return
  console.error(`[${context}] Transaction error`, error)
}
