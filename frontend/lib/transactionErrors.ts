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

export function formatTransactionError(error: unknown): string {
  const raw = errorText(error)
  const short = shortText(error)
  const combined = `${short}\n${raw}`

  if (matchesAny(combined, USER_REJECTED_PATTERNS)) {
    return 'Transaction rejected'
  }

  if (matchesAny(combined, NOISY_TRANSACTION_PATTERNS)) {
    return 'Transaction error'
  }

  const candidate = short || raw
  if (!candidate || candidate.length > 180) return 'Transaction error'
  return candidate
}

export function logTransactionError(error: unknown, context: string): void {
  if (!error) return
  console.error(`[${context}] Transaction error`, error)
}
