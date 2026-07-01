import { NextRequest, NextResponse } from 'next/server'
import { getStreamingBoardMeta, setStreamingBoardMeta } from '@/lib/streaming/boardMeta'
import type { Vertical } from '@/lib/strategy'

const VERTICALS: Vertical[] = ['openinternet', 'github', 'superfluid']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const { address, vertical, name } = (body ?? {}) as { address?: string; vertical?: string; name?: string }

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address))
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
    if (!vertical || !VERTICALS.includes(vertical as Vertical))
      return NextResponse.json({ error: 'Invalid vertical' }, { status: 400 })

    await setStreamingBoardMeta(address, { vertical: vertical as Vertical, name: name?.slice(0, 120) })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[streaming/register] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get('address')
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address))
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  const meta = await getStreamingBoardMeta(address)
  return NextResponse.json({ meta })
}
