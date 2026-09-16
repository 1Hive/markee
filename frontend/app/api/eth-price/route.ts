import { NextResponse } from 'next/server'
import { withServerError } from '@/lib/server/withServerError'
import { logger } from '@/lib/server/logger'

const CACHE_TTL = 15 * 60

export const revalidate = CACHE_TTL

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
    next: { revalidate: CACHE_TTL },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`${provider.name} ${response.status}`)
  return provider.parse(await response.json())
}

export const GET = withServerError('GET /api/eth-price', async () => {
  const errors: string[] = []

  for (const provider of PROVIDERS) {
    try {
      const usd = await fetchPrice(provider)
      if (errors.length > 0) {
        logger.warn('eth-price: using fallback provider', {
          provider: provider.name,
          errors,
        })
      }
      return NextResponse.json({ usd })
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  throw new Error(`ETH price providers failed: ${errors.join('; ')}`)
})
