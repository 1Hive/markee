// frontend/app/api/github/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

// This is the single gate the embed modal checks on every mount to decide "Connect GitHub" vs the
// repo picker -- without explicit no-store, a browser (or an intermediary cache) can serve back the
// stale "connected: false" it got before OAuth completed, forever, even after the cookie is set
// correctly. That looks exactly like GitHub never actually connecting.
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: NextRequest) {
  const uid = request.cookies.get('github_uid')?.value
  if (!uid) {
    return NextResponse.json({ connected: false }, { headers: NO_CACHE })
  }

  const raw = await kv.get<string>(`github:user:${uid}`)
  if (!raw) {
    // Cookie exists but KV entry expired — clear cookie
    const res = NextResponse.json({ connected: false }, { headers: NO_CACHE })
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
  }, { headers: NO_CACHE })
}

export async function DELETE(request: NextRequest) {
  const uid = request.cookies.get('github_uid')?.value

  // Clear the KV session record alongside the cookie so the data doesn't
  // linger for a year after an explicit disconnect
  if (uid) {
    await kv.del(`github:user:${uid}`)
  }

  const res = NextResponse.json({ disconnected: true }, { headers: NO_CACHE })
  res.cookies.delete('github_uid')
  return res
}
