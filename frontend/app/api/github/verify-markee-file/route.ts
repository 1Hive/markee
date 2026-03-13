// app/api/github/verify-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getLinkedFiles, saveLinkedFiles } from '@/lib/github/linkedFiles'

const MARKEE_START = '<!-- MARKEE:START -->'
const MARKEE_END   = '<!-- MARKEE:END -->'

async function getGithubToken(uid: string): Promise<string | null> {
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

export async function POST(request: NextRequest) {
  try {
    const uid = request.cookies.get('github_uid')?.value
    if (!uid) return NextResponse.json({ error: 'Not authenticated with GitHub' }, { status: 401 })

    const token = await getGithubToken(uid)
    if (!token) return NextResponse.json({ error: 'GitHub token not found — please reconnect' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const { leaderboardAddress, repoFullName, filePath } = (body ?? {}) as {
      leaderboardAddress?: string; repoFullName?: string; filePath?: string
    }
    if (!leaderboardAddress || !repoFullName || !filePath)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

    const fileRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' } }
    )
    if (!fileRes.ok)
      return NextResponse.json({ error: `Could not fetch file from GitHub (${fileRes.status})` }, { status: 400 })

    const content = await fileRes.text()
    const verified = content.includes(MARKEE_START) && content.includes(MARKEE_END)

    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(e => e.repoFullName === repoFullName && e.filePath === filePath)
    if (idx < 0) return NextResponse.json({ error: 'File not found in linked files list' }, { status: 404 })

    existing[idx] = { ...existing[idx], verified }
    await saveLinkedFiles(leaderboardAddress, existing)

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[verify-markee-file] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
