import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { verificationStatusFor } from '@/lib/leaderboards/verificationStatus'
import { readClientEvidenceForBoards } from '@/lib/sdk/client-observations'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// Link-only operator view. Return observations only for verified sites.
// Unmarked SDK API calls cannot distinguish an older SDK from a custom client.
export async function POST(request: NextRequest) {
  if (!await underRateLimit('boards:client-observations', clientIp(request), 20, 60)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } })
  }
  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.addresses) || body.addresses.length > 200 || body.addresses.some((address: unknown) => typeof address !== 'string' || !isAddress(address))) {
    return NextResponse.json({ error: 'Expected up to 200 board addresses' }, { status: 400, headers: NO_STORE })
  }
  const addresses = [...new Set((body.addresses as string[]).map(address => address.toLowerCase()))]
  try {
    const verification = await verificationStatusFor(addresses)
    const clientEvidence = await readClientEvidenceForBoards(Object.fromEntries(addresses.map(address => [address, verification[address]?.verifiedUrls ?? []])))
    return NextResponse.json({ verification, ...clientEvidence }, { headers: NO_STORE })
  } catch (error) {
    console.error('[boards/client-observations] read failed', error)
    return NextResponse.json({ error: 'Integration evidence unavailable' }, { status: 503, headers: NO_STORE })
  }
}
