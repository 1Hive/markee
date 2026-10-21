// app/api/github/unlink-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { base } from 'viem/chains'
import { getLinkedFiles, saveLinkedFiles } from '@/lib/github/linkedFiles'
import { unlinkFileMessage } from '@/lib/github/unlink'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { readBoardOwners } from '@/lib/moderation/server'

export const dynamic = 'force-dynamic'

// DELETE ?address=<board>&repo=<owner/name>&file=<path>, body { owner, signature, timestamp }.
// Only a board owner (on-chain admin or creator) can unlink; the signature covers
// unlinkFileMessage(8453, board, repo, file, timestamp) and is good for 5 minutes.
// Only allowed for verified === false entries.
// If still Live, user must remove delimiters first → Refresh → then Remove.

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leaderboardAddress = searchParams.get('address')
    const repoFullName       = searchParams.get('repo')
    const filePath           = searchParams.get('file')

    if (!leaderboardAddress || !repoFullName || !filePath)
      return NextResponse.json({ error: 'Missing address, repo, or file param' }, { status: 400 })

    const { owner: rawOwner, signature, timestamp } = await request.json().catch(() => ({})) as {
      owner?: string
      signature?: `0x${string}`
      timestamp?: number
    }
    const owner = rawOwner?.toLowerCase()
    if (!owner || !ADDRESS_PATTERN.test(owner))
      return NextResponse.json({ error: 'Missing or invalid owner address' }, { status: 400 })
    if (!signature || typeof timestamp !== 'number' || !Number.isInteger(timestamp))
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 400 })
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300)
      return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    const valid = await verifyMessage({
      address: owner as `0x${string}`,
      message: unlinkFileMessage(base.id, leaderboardAddress, repoFullName, filePath, timestamp),
      signature,
    }).catch(() => false)
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    const [owners] = await readBoardOwners([leaderboardAddress.toLowerCase()])
    if (!owners?.includes(owner))
      return NextResponse.json({ error: "Only this board's owner can unlink its files" }, { status: 403 })

    const existing = await getLinkedFiles(leaderboardAddress)
    const idx = existing.findIndex(
      e => e.repoFullName === repoFullName && e.filePath === filePath
    )

    if (idx < 0)
      return NextResponse.json({ error: 'File not found' }, { status: 404 })

    if (existing[idx].verified)
      return NextResponse.json(
        { error: 'Remove the delimiters from the file first, then Refresh to confirm, before unlinking.' },
        { status: 409 }
      )

    existing.splice(idx, 1)
    await saveLinkedFiles(leaderboardAddress, existing)

    return NextResponse.json({ success: true, linkedFiles: existing })
  } catch (err) {
    console.error('[unlink-markee-file] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
