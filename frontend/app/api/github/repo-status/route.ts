// app/api/github/register-markee/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const MARKEE_START = '<!-- MARKEE:START -->'
const MARKEE_END = '<!-- MARKEE:END -->'

export interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl: string
  repoHtmlUrl: string
  filePath: string
  verified: boolean
  linkedAt: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getGithubToken(uid: string): Promise<string | null> {
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

async function checkDelimiters(token: string, repoFullName: string, filePath: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.raw',
        },
      }
    )
    if (!res.ok) return false
    const content = await res.text()
    return content.includes(MARKEE_START) && content.includes(MARKEE_END)
  } catch {
    return false
  }
}

async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`
  const raw = await kv.get(kvKey)
  if (!raw) return []

  // Handle legacy single-object format from before the array migration
  if (Array.isArray(raw)) return raw as LinkedFile[]
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    if (obj.repoFullName) {
      // Migrate legacy single entry to array
      return [{
        repoFullName: obj.repoFullName as string,
        repoOwner: (obj.repoOwner ?? '') as string,
        repoName: (obj.repoName ?? '') as string,
        repoAvatarUrl: (obj.repoAvatarUrl ?? '') as string,
        repoHtmlUrl: (obj.repoHtmlUrl ?? '') as string,
        filePath: (obj.filePath ?? '') as string,
        verified: (obj.repoVerified ?? false) as boolean,
        linkedAt: (obj.linkedAt ?? new Date().toISOString()) as string,
      }]
    }
  }
  return []
}

// ── POST /api/github/register-markee ─────────────────────────────────────────

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

    // Auth — read GitHub uid from session cookie
    const uid = request.cookies.get('github_uid')?.value
    if (!uid) {
      return NextResponse.json({ error: 'Not authenticated with GitHub' }, { status: 401 })
    }

    const token = await getGithubToken(uid)
    if (!token) {
      return NextResponse.json({ error: 'GitHub token not found — please reconnect' }, { status: 401 })
    }

    // Fetch repo metadata from GitHub API
    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!repoRes.ok) {
      return NextResponse.json({ error: 'Could not fetch repo metadata from GitHub' }, { status: 400 })
    }
    const repoData = await repoRes.json()

    // Check for delimiters in the file
    const verified = await checkDelimiters(token, repoFullName, filePath)

    const newEntry: LinkedFile = {
      repoFullName,
      repoOwner: repoData.owner.login,
      repoName: repoData.name,
      repoAvatarUrl: repoData.owner.avatar_url,
      repoHtmlUrl: repoData.html_url,
      filePath,
      verified,
      linkedAt: new Date().toISOString(),
    }

    // Read existing array, upsert on repoFullName + filePath
    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(
      e => e.repoFullName === repoFullName && e.filePath === filePath
    )
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...newEntry }
    } else {
      existing.push(newEntry)
    }

    await kv.set(`github:markee:${leaderboardAddress.toLowerCase()}`, existing)

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[register-markee] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
