import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Client-submitted points are retired; rewards are calculated from finalized on-chain streaming data.' },
    { status: 410 },
  )
}
