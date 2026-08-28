// frontend/app/api/github/repo-files/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveSession, SESSION_COOKIE } from '@/lib/github/session'

export async function GET(request: NextRequest) {
  const session = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { accessToken } = session

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get('repo') // e.g. "1hive/gardens"
  if (!repo) {
    return NextResponse.json({ error: 'Missing repo param' }, { status: 400 })
  }

  // Get the default branch SHA first
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!repoRes.ok) {
    return NextResponse.json({ error: 'Repo not found or no access' }, { status: 403 })
  }

  const repoData = await repoRes.json()
  // Backstop for register-markee's own check: my-repos already excludes private repos from the
  // picker, so this only matters if someone hits this endpoint directly with a repo they can't
  // actually link (a stale repo=... in the URL, or a pre-scope-narrowing session).
  if (repoData.private) {
    return NextResponse.json({ error: 'Private repositories can\'t be linked to a Markee' }, { status: 403 })
  }
  const defaultBranch = repoData.default_branch ?? 'main'

  // Fetch the full recursive tree — much faster than walking the tree manually
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    }
  )

  if (!treeRes.ok) {
    return NextResponse.json({ error: 'Could not fetch repo tree' }, { status: 500 })
  }

  const treeData = await treeRes.json()

  // Filter to .md files only, exclude node_modules and other noise
  const mdFiles: string[] = (treeData.tree ?? [])
    .filter((item: { type: string; path: string }) =>
      item.type === 'blob' &&
      item.path.endsWith('.md') &&
      !item.path.startsWith('node_modules/') &&
      !item.path.startsWith('.') &&
      !item.path.includes('/node_modules/')
    )
    .map((item: { path: string }) => item.path)
    .sort((a: string, b: string) => {
      // Sort: root-level files first, then by depth, then alphabetically
      const aDepth = a.split('/').length
      const bDepth = b.split('/').length
      if (aDepth !== bDepth) return aDepth - bDepth
      return a.localeCompare(b)
    })
    .slice(0, 100) // cap at 100 results

  return NextResponse.json({ files: mdFiles })
}
