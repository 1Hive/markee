// app/api/github/unlink-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { base } from 'viem/chains'
import { getLinkedFiles, saveLinkedFiles } from '@/lib/github/linkedFiles'
import { unlinkFileMessage } from '@/lib/github/unlink'
import { boardAdminDenial } from '@/lib/boards/admin-auth'

export const dynamic = 'force-dynamic'

// DELETE ?address=<board>&repo=<owner/name>&file=<path>, body { owner, signature, timestamp }.
// Only the board admin can unlink, whether or not the file still carries the board's markers; the
// signature covers unlinkFileMessage(8453, board, repo, file, timestamp) and is good for 5 minutes.

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leaderboardAddress = searchParams.get('address')?.toLowerCase()
    const repoFullName       = searchParams.get('repo')
    const filePath           = searchParams.get('file')

    if (!leaderboardAddress || !repoFullName || !filePath)
      return NextResponse.json({ error: 'Missing address, repo, or file param' }, { status: 400 })

    const proof = await request.json().catch(() => ({})) as { owner?: unknown; signature?: unknown; timestamp?: unknown }
    const denial = await boardAdminDenial(
      leaderboardAddress,
      proof,
      timestamp => unlinkFileMessage(base.id, leaderboardAddress, repoFullName, filePath, timestamp),
      'unlink its files',
    )
    if (denial) return NextResponse.json({ error: denial.error }, { status: denial.status })

    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(e => e.repoFullName === repoFullName && e.filePath === filePath)
    if (idx < 0)
      return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const [removed] = existing.splice(idx, 1)
    await saveLinkedFiles(leaderboardAddress, existing)

    const contractKey = `github:contract:${leaderboardAddress}`
    const contract = await kv.get<{ owner: string; repo: string }>(contractKey)
    const repoStillLinked = existing.some(e => e.repoFullName === removed.repoFullName)
    if (contract && !repoStillLinked && `${contract.owner}/${contract.repo}`.toLowerCase() === removed.repoFullName.toLowerCase())
      await kv.del(contractKey)

    return NextResponse.json({ success: true, linkedFiles: existing })
  } catch (err) {
    console.error('[unlink-markee-file] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
