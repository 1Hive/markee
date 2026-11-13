// app/api/github/register-markee/route.ts
//
// POST { leaderboardAddress, repoFullName, filePath, owner?, signature?, timestamp? }
//   Links a public repo file the caller can push to. Only the board admin can add a new file: the
//   signature covers registerFileMessage(8453, board, repo, file, timestamp) and is good for 5
//   minutes. Re-registering a file already on the board only needs push access, so maintainers can
//   refresh it without the admin wallet.
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { base } from 'viem/chains'
import { boardAdminDenial } from '@/lib/boards/admin-auth'
import { registerFileMessage } from '@/lib/github/unlink'
import { getLinkedFiles, saveLinkedFiles, hasDelimiterPair, legacyAddressesFor, fetchGithubFileContent, type LinkedFile } from '@/lib/github/linkedFiles'
import { resolveSession, SESSION_COOKIE } from '@/lib/github/session'

// @vercel/kv leaves fetch caching to Next, which would otherwise store (and can replay) KV reads.
export const dynamic = 'force-dynamic'

// A timeout or missing file both just mean "not verified yet" here (the panel's own "Check Now"
// retries with the same bounded fetch), so this stays a plain boolean unlike verify-markee-file's
// explicit check, which needs to tell the user apart from a genuine not-found.
async function checkDelimiters(
  token: string,
  repoFullName: string,
  filePath: string,
  leaderboardAddress: string,
): Promise<boolean> {
  const result = await fetchGithubFileContent(repoFullName, filePath, token)
  if (!result.ok) return false
  const legacyAddrs = legacyAddressesFor(leaderboardAddress)
  return hasDelimiterPair(result.content, leaderboardAddress) || legacyAddrs.some(old => hasDelimiterPair(result.content, old))
}

export async function POST(request: NextRequest) {
  try {
    const session = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value)
    if (!session) return NextResponse.json({ error: 'Not authenticated with GitHub' }, { status: 401 })

    const token = session.accessToken
    // Persist the GitHub numeric id, never the session id, because update-markee-file
    // and traffic resolve tokens by `github:user:{id}` from these records.
    const uid = session.githubUserId

    const body = await request.json().catch(() => null)
    const { leaderboardAddress, repoFullName, filePath, owner, signature, timestamp } = (body ?? {}) as {
      leaderboardAddress?: string; repoFullName?: string; filePath?: string
      owner?: unknown; signature?: unknown; timestamp?: unknown
    }

    if (!leaderboardAddress || !repoFullName || !filePath)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    if (!/^0x[0-9a-fA-F]{40}$/.test(leaderboardAddress))
      return NextResponse.json({ error: 'Invalid leaderboard address' }, { status: 400 })
    if (typeof repoFullName !== 'string' || typeof filePath !== 'string')
      return NextResponse.json({ error: 'Invalid repo or file' }, { status: 400 })

    const normalizedAddress = leaderboardAddress.toLowerCase()

    // Verify push access
    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!repoRes.ok) return NextResponse.json({ error: 'Repo not found or no access' }, { status: 403 })
    const repoData = await repoRes.json()
    if (!repoData.permissions?.push)
      return NextResponse.json({ error: `You need push access to ${repoFullName}` }, { status: 403 })
    // Markee's whole point is public visibility, so a private repo's file was never a valid
    // verification target -- this is the hard enforcement point (my-repos filters the picker,
    // repo-files backstops the file-list step, this is what actually persists a link).
    if (repoData.private)
      return NextResponse.json({ error: 'Private repositories can\'t be linked to a Markee' }, { status: 403 })

    const existing = await getLinkedFiles(normalizedAddress)
    const idx = existing.findIndex(e => e.repoFullName === repoData.full_name && e.filePath === filePath)
    if (idx < 0) {
      const denial = await boardAdminDenial(
        normalizedAddress,
        { owner, signature, timestamp },
        ts => registerFileMessage(base.id, normalizedAddress, repoFullName, filePath, ts),
        'link repos to it',
      )
      if (denial) return NextResponse.json({ error: denial.error }, { status: denial.status })
    }

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

    if (idx >= 0) existing[idx] = { ...existing[idx], ...newEntry }
    else existing.push(newEntry)

    await saveLinkedFiles(normalizedAddress, existing)

    // Reverse lookup so traffic/route.ts can resolve address → repo + token owner. Only a file that
    // carries the board's markers can take it over.
    if (verified) {
      await kv.set(
        `github:contract:${normalizedAddress}`,
        { owner: repoData.owner.login, repo: repoData.name, githubUserId: uid },
        { ex: 60 * 60 * 24 * 365 * 5 }
      )
    }

    return NextResponse.json({ success: true, verified, linkedFiles: existing })
  } catch (err) {
    console.error('[register-markee] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
