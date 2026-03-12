// frontend/app/api/github/repo-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')?.toLowerCase()

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const raw = await kv.get<string>(`github:markee:${address}`)
  if (!raw) {
    return NextResponse.json({ linked: false })
  }

  const meta = typeof raw === 'string' ? JSON.parse(raw) : raw
  return NextResponse.json({
    linked: true,
    repoFullName: meta.repoFullName,
    repoAvatarUrl: meta.repoAvatarUrl,
    repoHtmlUrl: meta.repoHtmlUrl,
    filePath: meta.filePath,
    linkedBy: meta.linkedBy,
  })
}
