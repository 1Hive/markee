// app/api/github/verify-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getLinkedFiles, saveLinkedFiles, hasDelimiterPair, legacyAddressesFor, fetchGithubFileContent } from '@/lib/github/linkedFiles'

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

    const fileResult = await fetchGithubFileContent(repoFullName, filePath, token)
    if (!fileResult.ok) {
      return NextResponse.json(
        { error: fileResult.reason === 'timeout'
          ? 'GitHub took too long to respond — try again in a moment.'
          : `Could not fetch the file from GitHub (${fileResult.status}) — check it still exists at that path.` },
        { status: 400 },
      )
    }

    const content = fileResult.content
    const normalizedNew = leaderboardAddress.toLowerCase()
    const legacyAddrs = legacyAddressesFor(normalizedNew)
    const verified =
      hasDelimiterPair(content, normalizedNew) ||
      legacyAddrs.some(old => hasDelimiterPair(content, old))

    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(e => e.repoFullName === repoFullName && e.filePath === filePath)
    if (idx < 0) return NextResponse.json({ error: 'File not found in linked files list' }, { status: 404 })

    existing[idx] = { ...existing[idx], verified }
    await saveLinkedFiles(leaderboardAddress, existing)

    // If this flip made the file Live, write the current top message.
    // Awaited before returning — fire-and-forget is unreliable on Vercel serverless
    // since the runtime may terminate the function immediately after the response is sent.
    if (verified) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
      await fetch(`${siteUrl}/api/github/update-markee-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress }),
      }).catch(err => console.error('[verify-markee-file] update-markee-file trigger failed:', err))
    }

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[verify-markee-file] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
