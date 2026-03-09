// frontend/app/api/github/register-markee/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function POST(request: NextRequest) {
  const uid = request.cookies.get('github_uid')?.value
  if (!uid) {
    return NextResponse.json({ error: 'Not authenticated with GitHub' }, { status: 401 })
  }

  const raw = await kv.get<string>(`github:user:${uid}`)
  if (!raw) {
    return NextResponse.json({ error: 'GitHub session expired' }, { status: 401 })
  }

  const { accessToken, login, avatarUrl } = typeof raw === 'string' ? JSON.parse(raw) : raw

  const body = await request.json().catch(() => null)
  const { leaderboardAddress, repoFullName, filePath } = body ?? {}

  if (!leaderboardAddress || !repoFullName || !filePath) {
    return NextResponse.json({ error: 'Missing leaderboardAddress, repoFullName, or filePath' }, { status: 400 })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(leaderboardAddress)) {
    return NextResponse.json({ error: 'Invalid leaderboard address' }, { status: 400 })
  }

  // Verify the user actually has push access to the claimed repo
  const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!repoRes.ok) {
    return NextResponse.json({ error: 'Repo not found or no access' }, { status: 403 })
  }

  const repoData = await repoRes.json()

  // push: true means the user can write — sufficient to prove ownership/control
  if (!repoData.permissions?.push) {
    return NextResponse.json(
      { error: `You need push access to ${repoFullName} to link it here` },
      { status: 403 }
    )
  }

  const meta = {
    leaderboardAddress: leaderboardAddress.toLowerCase(),
    repoFullName: repoData.full_name,          // use canonical casing from GitHub
    repoOwner: repoData.owner.login,
    repoName: repoData.name,
    repoAvatarUrl: repoData.owner.avatar_url,
    repoHtmlUrl: repoData.html_url,
    filePath,
    linkedBy: login,
    linkedByUid: uid,
    linkedAt: new Date().toISOString(),
  }

  // Store by leaderboard address — one verified link per leaderboard
  await kv.set(
    `github:markee:${leaderboardAddress.toLowerCase()}`,
    JSON.stringify(meta),
    { ex: 60 * 60 * 24 * 365 * 5 } // 5 years
  )

  // Also index by repo so we can list all leaderboards for a repo
  await kv.sadd(`github:repo:${repoData.full_name}:leaderboards`, leaderboardAddress.toLowerCase())

  return NextResponse.json({ success: true, meta })
}
