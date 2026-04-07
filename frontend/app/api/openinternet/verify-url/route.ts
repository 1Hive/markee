import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { address, url } = await req.json()
    if (!address || !url) {
      return NextResponse.json({ error: 'Missing address or url' }, { status: 400 })
    }

    const normalizedAddress = address.toLowerCase()

    let html: string
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Markee-Verifier/1.0' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        return NextResponse.json({ verified: false, error: `Could not fetch URL (HTTP ${res.status})` })
      }
      html = await res.text()
    } catch {
      return NextResponse.json({ verified: false, error: 'Could not reach that URL. Is it publicly accessible?' })
    }

    // Check: data-markee-address attribute must be present in the server-rendered HTML
    const hasDataAttr = new RegExp(`data-markee-address=["']${normalizedAddress}["']`, 'i').test(html)

    if (!hasDataAttr) {
      return NextResponse.json({
        verified: false,
        error: 'This Markee is not detected at this URL, see the integration guide to add to your site.',
      })
    }

    // Append URL to verifiedUrls array (no duplicates)
    const key = `oi:meta:${normalizedAddress}`
    const existing = (await kv.get<Record<string, unknown>>(key)) ?? {}

    // Migrate legacy single verifiedUrl to array
    const existingUrls: string[] = Array.isArray(existing.verifiedUrls)
      ? (existing.verifiedUrls as string[])
      : existing.verifiedUrl
        ? [existing.verifiedUrl as string]
        : []

    const verifiedUrls = existingUrls.includes(url) ? existingUrls : [...existingUrls, url]

    await kv.set(key, {
      ...existing,
      verifiedUrls,
      verifiedUrl: verifiedUrls[0], // keep for backward compat
      status: 'verified',
    })

    await Promise.all([
      kv.del('cache:openinternet:leaderboards'),
      kv.del('cache:ecosystem:leaderboards'),
    ])

    return NextResponse.json({ verified: true, verifiedUrls })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
