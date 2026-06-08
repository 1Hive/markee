// POST /api/superfluid/verify-url
//
// Self-serve HTML tag verification for Superfluid leaderboards.
// Checks that data-markee-address is present in the page's server-rendered HTML,
// then writes verifiedUrls + status to sf:meta:{address} in KV.
//
// Body: { address, url }

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { checkHtmlTag } from '@/lib/verify/checkHtmlTag'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { address, url } = await req.json()
    if (!address || !url) {
      return NextResponse.json({ error: 'Missing address or url' }, { status: 400 })
    }

    const normalizedAddress = address.toLowerCase()

    const result = await checkHtmlTag(normalizedAddress, url)
    if (!result.verified) {
      return NextResponse.json({ verified: false, error: result.error })
    }

    const key = `sf:meta:${normalizedAddress}`
    const existing = (await kv.get<Record<string, unknown>>(key)) ?? {}

    const existingUrls: string[] = Array.isArray(existing.verifiedUrls)
      ? (existing.verifiedUrls as string[])
      : existing.verifiedUrl
        ? [existing.verifiedUrl as string]
        : []

    const verifiedUrls = existingUrls.includes(url) ? existingUrls : [...existingUrls, url]

    await kv.set(key, {
      ...existing,
      verifiedUrls,
      verifiedUrl: verifiedUrls[0],
      status: 'verified',
    })

    await Promise.all([
      kv.del('cache:superfluid:leaderboards'),
      kv.del('cache:ecosystem:leaderboards'),
    ])

    return NextResponse.json({ verified: true, verifiedUrls })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
