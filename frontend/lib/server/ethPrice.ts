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
    next: { revalidate: ETH_PRICE_TTL_SECONDS },
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

/** KV-cached price; refreshes from the providers on a miss. Throws when no price is available. */
export async function getEthPriceUsd(): Promise<number> {
  const cached = await kv.get<number>(ETH_PRICE_KV_KEY).catch(() => null)
  if (typeof cached === 'number' && Number.isFinite(cached) && cached > 0) return cached
  const usd = await fetchEthPriceUsd()
  await kv.set(ETH_PRICE_KV_KEY, usd, { ex: ETH_PRICE_TTL_SECONDS }).catch(() => {})
  return usd
}
