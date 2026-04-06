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
      return NextResponse.json({ verified: false, error: 'Could not reach that URL — is it publicly accessible?' })
    }

    // Match <meta name="markee-address" content="0x..."> in either attribute order
    const found =
      new RegExp(`<meta[^>]+name=["']markee-address["'][^>]+content=["']${normalizedAddress}["']`, 'i').test(html) ||
      new RegExp(`<meta[^>]+content=["']${normalizedAddress}["'][^>]+name=["']markee-address["']`, 'i').test(html)

    if (!found) {
      return NextResponse.json({
        verified: false,
        error: `Meta tag not found. Add <meta name="markee-address" content="${normalizedAddress}"> to your page's <head>, then try again.`,
      })
    }

    // Write verified status to KV
    const key = `oi:meta:${normalizedAddress}`
    const existing = (await kv.get<Record<string, unknown>>(key)) ?? {}
    await kv.set(key, { ...existing, verifiedUrl: url, status: 'verified' })

    // Bust caches
    await Promise.all([
      kv.del('cache:openinternet:leaderboards'),
      kv.del('cache:ecosystem:leaderboards'),
    ])

    return NextResponse.json({ verified: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
