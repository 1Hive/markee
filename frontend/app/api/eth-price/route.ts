import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { withServerError } from '@/lib/server/withServerError'
import { logger } from '@/lib/server/logger'

const CACHE_KEY = 'cache:eth-price-usd'
const CACHE_TTL = 900 // 15 minutes -- was 5; CoinGecko's free endpoint rate-limits by shared
// IP across every caller on Vercel's infra, not just us, so cutting call volume ~3x matters more
// here than shaving staleness on a number that's only ever shown as an approximate "≈$X".
// Served when CoinGecko fails: stale beats missing for a number every USD display on the site reads.
const LAST_GOOD_KEY = 'cache:eth-price-usd:lastgood'
const LAST_GOOD_TTL = 7 * 24 * 60 * 60
// A stale-fallback breadcrumb, cooldown-gated so a sustained CoinGecko outage logs once per
// window instead of once per request -- otherwise there's zero signal between "brief 429 blip"
// and "CoinGecko's been down for days and everyone's seeing week-old prices."
const STALE_WARNED_KEY = 'cache:eth-price-usd:stale-warned'
const STALE_WARN_COOLDOWN = CACHE_TTL

export const dynamic = 'force-dynamic'

export const GET = withServerError('GET /api/eth-price', async () => {
  const cached = await kv.get<number>(CACHE_KEY)
  if (cached !== null) {
    return NextResponse.json({ usd: cached })
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)

    const data = await res.json()
    const usd = data?.ethereum?.usd as number
    if (!usd || typeof usd !== 'number') throw new Error('Invalid price data')

    await Promise.all([
      kv.set(CACHE_KEY, usd, { ex: CACHE_TTL }),
      kv.set(LAST_GOOD_KEY, usd, { ex: LAST_GOOD_TTL }),
    ])
    return NextResponse.json({ usd })
  } catch (err) {
    // CoinGecko's free tier 429s often enough (shared-IP rate limit, not usage-based) that this
    // isn't exceptional -- fall back quietly instead of 500ing and paging the error channel for
    // every rate-limit blip. Only a genuine failure with no fallback available still throws.
    const lastGood = await kv.get<number>(LAST_GOOD_KEY).catch(() => null)
    if (lastGood !== null) {
      const shouldWarn = await kv
        .set(STALE_WARNED_KEY, 1, { nx: true, ex: STALE_WARN_COOLDOWN })
        .catch(() => null) === 'OK'
      if (shouldWarn) {
        logger.warn('eth-price: serving stale fallback', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return NextResponse.json({ usd: lastGood, stale: true })
    }
    throw err
  }
})
