// frontend/app/api/github/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const uid = request.cookies.get('github_uid')?.value
  if (!uid) {
    return NextResponse.json({ connected: false })
  }

  const raw = await kv.get<string>(`github:user:${uid}`)
  if (!raw) {
    // Cookie exists but KV entry expired — clear cookie
    const res = NextResponse.json({ connected: false })
    res.cookies.delete('github_uid')
    return res
  }

  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  return NextResponse.json({
    connected: true,
    uid,
    login: data.login,
    avatarUrl: data.avatarUrl,
    installedAt: data.installedAt,
  })
}

export async function DELETE(request: NextRequest) {
  const res = NextResponse.json({ disconnected: true })
  res.cookies.delete('github_uid')
  return res
}
