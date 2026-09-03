import 'server-only'

type LogContext = Record<string, unknown>

const DISCORD_DESCRIPTION_LIMIT = 4_000
const DISCORD_FIELD_LIMIT = 1_000
const REDACTED = '[REDACTED]'

function isProductionDeployment(): boolean {
  // NODE_ENV is also "production" during local/preview builds. VERCEL_ENV keeps
  // Discord reporting exclusive to the production deployment.
  return process.env.VERCEL_ENV === 'production'
}

function redactString(value: string): string {
  let redacted = value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:api[_-]?key|key|token|secret|password)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/(\.g\.alchemy\.com\/v2\/)[^/?#\s]+/gi, `$1${REDACTED}`)
    .replace(/(discord(?:app)?\.com\/api\/webhooks\/)[^\s]+/gi, `$1${REDACTED}`)

  for (const [key, secret] of Object.entries(process.env)) {
    if (!secret || secret.length < 6 || !/(secret|token|key|password|webhook)/i.test(key)) continue
    redacted = redacted.split(secret).join(REDACTED)
  }

  return redacted
}

function serialize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object' || value === null) return value

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
      cause: value.cause === undefined ? undefined : serialize(value.cause, seen),
    }
  }

  if (Array.isArray(value)) return value.map(item => serialize(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /(authorization|cookie|password|secret|token|api[_-]?key|webhook)/i.test(key)
        ? REDACTED
        : serialize(item, seen),
    ]),
  )
}

function stringify(value: unknown, limit: number): string {
  let result: string
  try {
    result = JSON.stringify(serialize(value), null, 2) ?? redactString(String(value))
  } catch {
    result = redactString(String(value))
  }
  return result.length <= limit ? result : `${result.slice(0, limit - 14)}\n...[truncated]`
}

async function sendDiscordError(message: string, error: unknown, context: LogContext): Promise<void> {
  if (!isProductionDeployment()) return

  const webhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL?.trim()
  if (!webhookUrl) return

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
    body: JSON.stringify({
      username: 'Markee server',
      allowed_mentions: { parse: [] },
      embeds: [{
        title: redactString(message).slice(0, 256),
        color: 0xed4245,
        description: `\`\`\`json\n${stringify(error, DISCORD_DESCRIPTION_LIMIT - 12).replace(/\`\`\`/g, '\u02cb\u02cb\u02cb')}\n\`\`\``,
        fields: [
          {
            name: 'Context',
            value: `\`\`\`json\n${stringify(context, DISCORD_FIELD_LIMIT - 12).replace(/\`\`\`/g, '\u02cb\u02cb\u02cb')}\n\`\`\``,
          },
          {
            name: 'Deployment',
            value: redactString(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? 'unknown').slice(0, DISCORD_FIELD_LIMIT),
          },
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Discord error webhook returned HTTP ${response.status}`)
  }
}

async function reportError(message: string, error: unknown, context: LogContext = {}): Promise<void> {
  console.error(`[${message}]`, error, context)

  try {
    await sendDiscordError(message, error, context)
  } catch (reportingError) {
    console.error('[server-logger] Failed to report error to Discord:', reportingError)
  }
}

export const logger = {
  debug(message: string, context: LogContext = {}): void {
    console.debug(`[${message}]`, context)
  },
  info(message: string, context: LogContext = {}): void {
    console.info(`[${message}]`, context)
  },
  warn(message: string, context: LogContext = {}): void {
    console.warn(`[${message}]`, context)
  },
  error: reportError,
}
