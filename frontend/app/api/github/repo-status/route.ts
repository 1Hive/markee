// app/api/github/repo-status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getLinkedFiles } from '@/lib/github/linkedFiles'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    if (!address) return NextResponse.json({ error: 'Missing address param' }, { status: 400 })

    const linkedFiles = await getLinkedFiles(address)
    const primaryFile = linkedFiles.find(f => f.verified) ?? linkedFiles[0] ?? null

    return NextResponse.json({
      linkedFiles,
      // Legacy flat fields — kept for any older callers
      linked:        linkedFiles.length > 0,
      repoFullName:  primaryFile?.repoFullName  ?? null,
      repoOwner:     primaryFile?.repoOwner     ?? null,
      repoName:      primaryFile?.repoName      ?? null,
      repoAvatarUrl: primaryFile?.repoAvatarUrl ?? null,
      repoHtmlUrl:   primaryFile?.repoHtmlUrl   ?? null,
      filePath:      primaryFile?.filePath      ?? null,
      repoVerified:  primaryFile?.verified      ?? false,
    })
  } catch (err) {
    console.error('[repo-status] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
