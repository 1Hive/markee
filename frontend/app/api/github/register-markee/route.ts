// app/api/github/register-markee/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const MARKEE_START = '<!-- MARKEE:START -->'
const MARKEE_END = '<!-- MARKEE:END -->'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl: string
  repoHtmlUrl: string
  filePath: string
  verified: boolean
  linkedByUid: string   // preserved so update-markee-file can look up the access token
  linkedAt: string
}

// ── Shared KV helper ──────────────────────────────────────────────────────────
//
// Reads the LinkedFile array from KV, migrating the legacy single-object format
// stored by the old register-markee route.
//
// IMPORTANT: Legacy entries are treated as verified=true because the old route
// already verified push access before saving. The only thing the new format adds
// is delimiter verification, which we can't retroactively check without a live
// GitHub token, so we give old entries the benefit of the doubt.

export async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`

  // @vercel/kv auto-parses JSON, so the raw value will be an object or array
  const raw = await kv.get(kvKey)
  if (!raw) return []

  // New array format
  if (Array.isArray(raw)) return raw as LinkedFile[]

  // Legacy single-object (parsed from JSON string by @vercel/kv)
  if (typeof raw === 'object' && raw !== null) {
    return legacyToArray(raw as Record<string, unknown>)
  }

  // Paranoia: if somehow returned as a raw string, parse manually
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as LinkedFile[]
      if (typeof parsed === 'object' && parsed !== null) {
        return legacyToArray(parsed as Record<string, unknown>)
      }
    } catch { /* ignore */ }
  }

  return []
}

function legacyToArray(obj: Record<string, unknown>): LinkedFile[] {
  if (!obj.repoFullName) return []
  return [{
    repoFullName:  obj.repoFullName as string,
    repoOwner:     (obj.repoOwner    ?? '') as string,
    repoName:      (obj.repoName     ?? '') as string,
    repoAvatarUrl: (obj.repoAvatarUrl ?? '') as string,
    repoHtmlUrl:   (obj.repoHtmlUrl  ?? '') as string,
    filePath:      (obj.filePath     ?? '') as string,
    // Old format verified push access — treat as verified
    verified:      true,
    linkedByUid:   (obj.linkedByUid  ?? '') as string,
    linkedAt:      (obj.linkedAt     ?? '') as string,
  }]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getGithubToken(uid: string): Promise<string | null> {
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

async function checkDelimiters(
  token: string,
  repoFullName: string,
  filePath: string,
): Promise<boolean> {
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

// ── POST /api/github/register-markee ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const uid = request.cookies.get('github_uid')?.value
    if (!uid) {
      return NextResponse.json({ error: 'Not authenticated with GitHub' }, { status: 401 })
    }

    const token = await getGithubToken(uid)
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub token not found — please reconnect' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => null)
    const { leaderboardAddress, repoFullName, filePath } = (body ?? {}) as {
      leaderboardAddress?: string
      repoFullName?: string
      filePath?: string
    }

    if (!leaderboardAddress || !repoFullName || !filePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(leaderboardAddress)) {
      return NextResponse.json({ error: 'Invalid leaderboard address' }, { status: 400 })
    }

    // Verify push access
    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!repoRes.ok) {
      return NextResponse.json({ error: 'Repo not found or no access' }, { status: 403 })
    }
    const repoData = await repoRes.json()
    if (!repoData.permissions?.push) {
      return NextResponse.json(
        { error: `You need push access to ${repoFullName}` },
        { status: 403 }
      )
    }

    // Check for delimiters in the target file
    const verified = await checkDelimiters(token, repoData.full_name, filePath)

    const newEntry: LinkedFile = {
      repoFullName:  repoData.full_name,
      repoOwner:     repoData.owner.login,
      repoName:      repoData.name,
      repoAvatarUrl: repoData.owner.avatar_url,
      repoHtmlUrl:   repoData.html_url,
      filePath,
      verified,
      linkedByUid:   uid,
      linkedAt:      new Date().toISOString(),
    }

    // Upsert: replace existing entry for same repo+file, or append
    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(
      e => e.repoFullName === repoData.full_name && e.filePath === filePath
    )
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...newEntry }
    } else {
      existing.push(newEntry)
    }

    await kv.set(
      `github:markee:${leaderboardAddress.toLowerCase()}`,
      existing,
      { ex: 60 * 60 * 24 * 365 * 5 }
    )

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[register-markee] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
