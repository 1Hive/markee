// GET /api/boards/resolve?address=0x...
// Resolves a legacy board or Markee to its finished migration successor:
// { address, kind: 'board' | 'markee' | 'unchanged' }. CORS-open for embeds.
import { NextResponse } from 'next/server'
import { getAddress, isAddress } from 'viem'
import { cachedCurrentAddress } from '@/lib/contracts/currentAddressCache'

export const dynamic = 'force-dynamic'

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS })
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')
  if (!address || !isAddress(address, { strict: false })) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400, headers: HEADERS })
  }
  try {
    return NextResponse.json(await cachedCurrentAddress(getAddress(address)), { headers: HEADERS })
  } catch (err) {
    console.error('[boards/resolve]', err)
    return NextResponse.json({ error: 'Resolution unavailable' }, { status: 503, headers: HEADERS })
  }
}
