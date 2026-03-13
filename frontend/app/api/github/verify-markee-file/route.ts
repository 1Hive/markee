// app/api/github/verify-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { LinkedFile } from '../register-markee/route'

const MARKEE_START = '<!-- MARKEE:START -->'
const MARKEE_END = '<!-- MARKEE:END -->'

async function getGithubToken(uid: string): Promise<string | null> {
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`
  const raw = await kv.get(kvKey)
  if (!raw) return []
  if (Array.isArray(raw)) return raw as LinkedFile[]
  return []
}

// ── POST /api/github/verify-markee-file ──────────────────────────────────────
//
// Re-checks whether <!-- MARKEE:START --> / <!-- MARKEE:END --> exist in the
// specified file and updates the `verified` flag in KV accordingly.
// Called by the "Check again" button on unverified entries.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leaderboardAddress, repoFullName, filePath } = body as {
      leaderboardAddress?: string
      repoFullName?: string
      filePath?: string
    }

    if (!leaderboardAddress || !repoFullName || !filePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Auth
    const uid = request.cookies.get('github_uid')?.value
    if (!uid) {
      return NextResponse.json({ error: 'Not authenticated with GitHub' }, { status: 401 })
    }

    const token = await getGithubToken(uid)
    if (!token) {
      return NextResponse.json({ error: 'GitHub token not found — please reconnect' }, { status: 401 })
    }

    // Fetch file content and check for delimiters
    const fileRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.raw',
        },
      }
    )

    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Could not fetch file from GitHub (${fileRes.status})` },
        { status: 400 }
      )
    }

    const content = await fileRes.text()
    const verified = content.includes(MARKEE_START) && content.includes(MARKEE_END)

    // Update the specific entry in the array
    const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`
    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(
      e => e.repoFullName === repoFullName && e.filePath === filePath
    )

    if (idx < 0) {
      return NextResponse.json({ error: 'File not found in linked files list' }, { status: 404 })
    }

    existing[idx] = { ...existing[idx], verified }
    await kv.set(kvKey, existing)

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[verify-markee-file] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
