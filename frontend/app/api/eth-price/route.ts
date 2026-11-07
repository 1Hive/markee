import { NextResponse } from 'next/server'
import { withServerError } from '@/lib/server/withServerError'
import { getEthPriceUsd } from '@/lib/server/ethPrice'

// The price is cached once, in KV (lib/server/ethPrice.ts); no route-level cache on top of it.
export const dynamic = 'force-dynamic'

export const GET = withServerError('GET /api/eth-price', async () => {
  return NextResponse.json({ usd: await getEthPriceUsd() })
})
