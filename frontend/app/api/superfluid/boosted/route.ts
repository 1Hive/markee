/**
 * GET  /api/superfluid/boosted  — returns { boosted: BoostedMarkee[] }
 * POST /api/superfluid/boosted  — add or remove a boosted markee (admin wallet + signature)
 *
 * Admin wallets:
 *   0x809C9f8dd8CA93A41c3adca4972Fa234C28F7714
 *   0xAf4401E765dFf079aB6021BBb8d46E53E27613DB
 *
 * Signature message: markee-boosted:{action}:8453:{address}:{timestamp}
 * Timestamps older than 5 minutes are rejected.
 */

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { recoverMessageAddress } from 'viem'

export const dynamic = 'force-dynamic'

const BOOSTED_KEY = 'superfluid:s6:boosted'

export type BoostedMarkee = {
  address: string
  name: string
  logoUrl?: string
  projectUrl?: string
}

const ADMIN_ADDRESSES = [
  '0x809c9f8dd8ca93a41c3adca4972fa234c28f7714',
  '0xaf4401e765dff079ab6021bbb8d46e53e27613db',
]

function isAdmin(address: string): boolean {
  return ADMIN_ADDRESSES.includes(address.toLowerCase())
}

function corsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

export async function GET() {
  try {
    const boosted = await kv.get<BoostedMarkee[]>(BOOSTED_KEY)
    return NextResponse.json({ boosted: boosted ?? [] })
  } catch {
    return NextResponse.json({ boosted: [] })
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, address, name, logoUrl, projectUrl, adminAddress, signature, timestamp } = body ?? {}

  if (!action || !address || !adminAddress || !signature || !timestamp) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ error: 'action must be add or remove' }, { status: 400 })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]{40}$/.test(adminAddress)) {
    return NextResponse.json({ error: 'Invalid address format' }, { status: 400 })
  }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 })
  }
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > 300) {
    return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
  }

  const message = `markee-boosted:${action}:8453:${address.toLowerCase()}:${timestamp}`
  let recovered: string
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (recovered.toLowerCase() !== adminAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Signature mismatch' }, { status: 401 })
  }

  if (!isAdmin(adminAddress)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const current = (await kv.get<BoostedMarkee[]>(BOOSTED_KEY)) ?? []
  const normalizedAddress = address.toLowerCase()

  let updated: BoostedMarkee[]
  if (action === 'add') {
    const exists = current.some(b => b.address === normalizedAddress)
    if (exists) {
      // Update metadata
      updated = current.map(b =>
        b.address === normalizedAddress
          ? { ...b, name: name ?? b.name, logoUrl: logoUrl ?? b.logoUrl, projectUrl: projectUrl ?? b.projectUrl }
          : b
      )
    } else {
      updated = [...current, { address: normalizedAddress, name: name ?? normalizedAddress, logoUrl, projectUrl }]
    }
  } else {
    updated = current.filter(b => b.address !== normalizedAddress)
  }

  await kv.set(BOOSTED_KEY, updated)
  return NextResponse.json({ success: true, action, boosted: updated })
}

export async function OPTIONS() {
  const res = NextResponse.json(null, { status: 204 })
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return res
}
