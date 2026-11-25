import { NextRequest, NextResponse } from 'next/server'
import { isAddress, type Address } from 'viem'
import { verificationStatusFor } from '@/lib/leaderboards/verificationStatus'
import { readSdkVersionsForVerifiedUrls } from '@/lib/sdk/client-observations'
import { underRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// This returns only positive SDK signals for already verified website hosts.
// Unmarked traffic cannot distinguish an older SDK from a custom client.
export async function GET(request: NextRequest) {
  if (!await underRateLimit('boards:client-observations', clientIp(request), 60, 60)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } })
  }
  const board = request.nextUrl.searchParams.get('board')?.toLowerCase()
  if (!board || !isAddress(board)) return NextResponse.json({ error: 'Invalid board' }, { status: 400 })
  try {
    const verifiedUrls = (await verificationStatusFor([board]))[board]?.verifiedUrls ?? []
    return NextResponse.json(await readSdkVersionsForVerifiedUrls(board as Address, verifiedUrls), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[boards/client-observations] read failed', error)
    return NextResponse.json({ error: 'Client evidence unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
