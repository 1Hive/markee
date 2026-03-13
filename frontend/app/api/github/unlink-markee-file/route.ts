// app/api/github/unlink-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getLinkedFiles, saveLinkedFiles } from '@/lib/github/linkedFiles'

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
