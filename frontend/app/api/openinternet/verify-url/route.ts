import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const LEADERBOARD_ABI = [
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

async function getTopMessage(address: `0x${string}`): Promise<string | null> {
  try {
    const client = getClient()
    const result = await client.readContract({
      address,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [3n],
    })
    const [topAddresses, topFunds] = result as [readonly `0x${string}`[], readonly bigint[]]
    const topIdx = topFunds.findIndex(f => f > 0n)
    if (topIdx < 0 || !topAddresses[topIdx]) return null
    const msg = await client.readContract({
      address: topAddresses[topIdx],
      abi: MARKEE_ABI,
      functionName: 'message',
    })
    return (msg as string) || null
  } catch {
    return null
  }
}

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

    // Check A: data-markee-address attribute present on any element
    const hasDataAttr = new RegExp(`data-markee-address=["']${normalizedAddress}["']`, 'i').test(html)

    // Check B: current top message text appears in page HTML
    const topMessage = await getTopMessage(address as `0x${string}`)
    const hasMessage = !!topMessage && topMessage.length > 4 && html.includes(topMessage)

    if (!hasDataAttr && !hasMessage) {
      return NextResponse.json({
        verified: false,
        error: topMessage
          ? `This Markee is not detected at this URL, see the integration guide to add to your site.`
          : `This Markee is not detected at this URL, see the integration guide to add to your site.`,
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
