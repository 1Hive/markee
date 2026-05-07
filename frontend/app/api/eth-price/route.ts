import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const CACHE_KEY = 'cache:eth-price-usd'
const CACHE_TTL = 300 // 5 minutes

export async function GET() {
  try {
    const cached = await kv.get<number>(CACHE_KEY)
    if (cached !== null) {
      return NextResponse.json({ usd: cached })
    }

    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)

    const data = await res.json()
    const usd = data?.ethereum?.usd as number
    if (!usd || typeof usd !== 'number') throw new Error('Invalid price data')

    await kv.set(CACHE_KEY, usd, { ex: CACHE_TTL })
    return NextResponse.json({ usd })
  } catch (err) {
    console.error('[eth-price] error:', err)
    return NextResponse.json({ error: 'Failed to fetch ETH price' }, { status: 500 })
  }
}
