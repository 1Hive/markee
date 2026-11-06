import { NextResponse } from 'next/server'
import { withServerError } from '@/lib/server/withServerError'
import { getEthPriceUsd } from '@/lib/server/ethPrice'

export const revalidate = 900

export const GET = withServerError('GET /api/eth-price', async () => {
  return NextResponse.json({ usd: await getEthPriceUsd() })
})
