// Opt-in RPC call logging (LOG_RPC_CALLS=1), installed from instrumentation.ts. It wraps the
// server's fetch and logs one line per JSON-RPC request: the RPC host and the methods it carried.
// Vercel tags each runtime log line with its request path (cron and API routes alike), so the
// lines add up to RPC calls per route. Only the hostname is logged: RPC URL paths carry API keys.

const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11'
const INSTALLED = Symbol.for('markee.rpcLogging')

interface JsonRpcRequest { jsonrpc?: unknown; method?: unknown; params?: unknown }

/** The JSON-RPC methods in a request body, or null when the body is not JSON-RPC. */
export function rpcMethods(body: unknown): string[] | null {
  if (typeof body !== 'string' || !body.includes('"jsonrpc"')) return null
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return null }
  const calls = (Array.isArray(parsed) ? parsed : [parsed]) as JsonRpcRequest[]
  const methods = calls.filter(c => c && typeof c === 'object' && c.jsonrpc && typeof c.method === 'string').map(c => {
    const to = Array.isArray(c.params) && typeof (c.params[0] as { to?: unknown })?.to === 'string' ? (c.params[0] as { to: string }).to.toLowerCase() : null
    return c.method === 'eth_call' && to === MULTICALL3 ? 'eth_call(multicall)' : c.method as string
  })
  return methods.length ? methods : null
}

function hostOf(input: unknown): string {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url?: string })?.url
    return url ? new URL(url).host : 'unknown'
  } catch { return 'unknown' }
}

export function rpcLogLine(input: unknown, methods: string[]): string {
  const counts = new Map<string, number>()
  for (const m of methods) counts.set(m, (counts.get(m) ?? 0) + 1)
  return `[rpc] ${hostOf(input)} ${[...counts].map(([m, n]) => n > 1 ? `${m}x${n}` : m).join(' ')}`
}

export function installRpcLogging(target: { fetch: typeof fetch } = globalThis, log: (line: string) => void = console.log) {
  const marked = target as unknown as Record<symbol, boolean>
  if (marked[INSTALLED]) return
  const original = target.fetch
  target.fetch = function (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
    try {
      const methods = rpcMethods(init?.body)
      if (methods) log(rpcLogLine(input, methods))
    } catch { /* Logging must never break a request. */ }
    return original.call(target, input, init)
  } as typeof fetch
  marked[INSTALLED] = true
}
