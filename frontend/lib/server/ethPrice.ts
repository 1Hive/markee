import 'server-only'
import { kv } from '@vercel/kv'
import { logger } from '@/lib/server/logger'

// Shared ETH/USD price, cached in KV so the listing API can price totals without
// an extra round trip from the browser.
export const ETH_PRICE_KV_KEY = 'cache:eth-price-usd'
export const ETH_PRICE_TTL_SECONDS = 15 * 60

interface PriceProvider {
  name: string
  url: string
  parse: (data: unknown) => number
}

function positivePrice(value: unknown): number {
  const price = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price data')
  return price
}

const PROVIDERS: PriceProvider[] = [
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    parse: (data) => positivePrice(
      (data as { ethereum?: { usd?: unknown } } | null)?.ethereum?.usd,
    ),
  },
  {
    name: 'Coinbase',
    url: 'https://api.exchange.coinbase.com/products/ETH-USD/ticker',
    parse: (data) => positivePrice((data as { price?: unknown } | null)?.price),
  },
]

async function fetchPrice(provider: PriceProvider): Promise<number> {
  const response = await fetch(provider.url, {
    // KV is the one cache (ETH_PRICE_TTL_SECONDS); a second fetch-cache layer would stack its age on top.
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`${provider.name} ${response.status}`)
  return provider.parse(await response.json())
}

/** Live price from the first provider that answers. Throws when every provider fails. */
export async function fetchEthPriceUsd(): Promise<number> {
  const errors: string[] = []
  for (const provider of PROVIDERS) {
    try {
      const usd = await fetchPrice(provider)
      if (errors.length > 0) logger.warn('eth-price: using fallback provider', { provider: provider.name, errors })
      return usd
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(`ETH price providers failed: ${errors.join('; ')}`)
}

// The KV cache is optional. The @vercel/kv proxy throws synchronously on property access when KV
// isn't configured, before any promise exists, so each access is wrapped as a whole: a missing or
// failing cache must never stop the price from being fetched and returned.
async function readCachedPrice(): Promise<number | null> {
  try {
    const cached = await kv.get<number>(ETH_PRICE_KV_KEY)
    return typeof cached === 'number' && Number.isFinite(cached) && cached > 0 ? cached : null
  } catch (error) {
    logger.warn('eth-price: cache read failed', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

async function writeCachedPrice(usd: number): Promise<void> {
  try {
    await kv.set(ETH_PRICE_KV_KEY, usd, { ex: ETH_PRICE_TTL_SECONDS })
  } catch (error) {
    logger.warn('eth-price: cache write failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

/** KV-cached price; refreshes from the providers on a miss or when KV is unavailable. Throws when no
 *  price is available. */
// One provider refresh at a time per instance: concurrent cache misses share it.
let refreshing: Promise<number> | null = null

export async function getEthPriceUsd(): Promise<number> {
  const cached = await readCachedPrice()
  if (cached !== null) return cached
  refreshing ??= (async () => {
    try {
      const usd = await fetchEthPriceUsd()
      await writeCachedPrice(usd)
      return usd
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** The price if it's cached or arrives within `waitMs`, else null, so a page isn't held up by slow
 *  providers. A refresh still running keeps going and caches the price when it lands. */
export async function getEthPriceUsdWithin(waitMs = 1_500): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), waitMs) })
  try {
    return await Promise.race([getEthPriceUsd().catch(() => null), timeout])
  } finally {
    clearTimeout(timer)
  }
}
