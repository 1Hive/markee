// app/api/github/register-markee/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getLinkedFiles, saveLinkedFiles, startDelimiter, endDelimiter, type LinkedFile } from '@/lib/github/linkedFiles'

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
  leaderboardAddress: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' } }
    )
    if (!res.ok) return false
    const content = await res.text()
    return content.includes(startDelimiter(leaderboardAddress)) &&
           content.includes(endDelimiter(leaderboardAddress))
  } catch {
    return false
  }
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
    if (!/^0x[0-9a-fA-F]{40}$/.test(leaderboardAddress))
      return NextResponse.json({ error: 'Invalid leaderboard address' }, { status: 400 })

    const normalizedAddress = leaderboardAddress.toLowerCase()

    // Verify push access
    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found or no access' }, { status: 403 })
    const repoData = await repoRes.json()
    if (!repoData.permissions?.push)
      return NextResponse.json({ error: `You need push access to ${repoFullName}` }, { status: 403 })

    // Check for address-specific delimiters
    const verified = await checkDelimiters(token, repoData.full_name, filePath, normalizedAddress)

    const newEntry: LinkedFile = {
      repoFullName:  repoData.full_name,
      repoOwner:     repoData.owner.login,
      repoName:      repoData.name,
      repoAvatarUrl: repoData.owner.avatar_url,
      repoHtmlUrl:   repoData.html_url,
      filePath,
      verified,
      linkedByUid: uid,
      linkedAt:    new Date().toISOString(),
    }

    const existing = await getLinkedFiles(normalizedAddress)
    const idx = existing.findIndex(e => e.repoFullName === repoData.full_name && e.filePath === filePath)
    if (idx >= 0) existing[idx] = { ...existing[idx], ...newEntry }
    else existing.push(newEntry)

    await saveLinkedFiles(normalizedAddress, existing)

    // Write reverse-lookup key so traffic/route.ts can resolve address → repo + token owner.
    // Keyed by normalizedAddress; uid is stored as a string (consistent with github:user:{uid}).
    await kv.set(
      `github:contract:${normalizedAddress}`,
      { owner: repoData.owner.login, repo: repoData.name, githubUserId: uid },
      { ex: 60 * 60 * 24 * 365 * 5 }
    )

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[register-markee] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
