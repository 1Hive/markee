// app/api/account/verification-status/route.ts
//
// Streaming ("For Rent") boards are no longer split by platform -- a single streaming leaderboard can
// be integrated on a website, a GitHub repo, both, or neither, independent of whatever platform tag it
// was created with. So "is this board verified" can't be read off the platform-specific leaderboard
// listing routes (github/superfluid/openinternet/streaming) -- it has to be looked up per address,
// the same way regardless of platform: linked GitHub files (KV, keyed by address) and website
// verifiedUrls (KV, keyed by address) both exist independent of how the board was created.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getLinkedFiles, type LinkedFile } from '@/lib/github/linkedFiles'

export const dynamic = 'force-dynamic'
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

interface OiMeta {
  verifiedUrl?: string
  verifiedUrls?: string[]
}

export async function GET(request: NextRequest) {
  try {
    const raw = new URL(request.url).searchParams.get('addresses') ?? ''
    const addresses = [...new Set(raw.split(',').map(a => a.trim().toLowerCase()).filter(Boolean))].slice(0, 200)
    if (addresses.length === 0) return NextResponse.json({}, { headers: NO_CACHE })

    const oiMetaKeys = addresses.map(a => `oi:meta:${a}`)
    const [linkedFilesPerAddr, oiMetas] = await Promise.all([
      Promise.all(addresses.map(addr => getLinkedFiles(addr))),
      kv.mget<(OiMeta | null)[]>(...oiMetaKeys),
    ])

    const result: Record<string, { verifiedUrls: string[]; linkedFiles: LinkedFile[] }> = {}
    addresses.forEach((addr, i) => {
      const meta = oiMetas[i]
      const verifiedUrls = Array.isArray(meta?.verifiedUrls) ? meta!.verifiedUrls! : meta?.verifiedUrl ? [meta.verifiedUrl] : []
      result[addr] = { verifiedUrls, linkedFiles: linkedFilesPerAddr[i] }
    })

    return NextResponse.json(result, { headers: NO_CACHE })
  } catch (err) {
    console.error('[account/verification-status] error:', err)
    return NextResponse.json({}, { headers: NO_CACHE })
  }
}
