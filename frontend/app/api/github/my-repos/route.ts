// frontend/app/api/github/my-repos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveSession, SESSION_COOKIE } from '@/lib/github/session'

export const dynamic = 'force-dynamic'

interface GitHubRepo {
  id: number
  full_name: string
  name: string
  owner: { login: string; avatar_url: string }
  html_url: string
  description: string | null
  private: boolean
  permissions?: { push: boolean; admin: boolean }
}

export async function GET(request: NextRequest) {
  const session = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { accessToken } = session

  // Fetch all repos the user can push to (own + org + collaborator)
  // GitHub paginates at 100 — fetch first 2 pages (200 repos) which covers 99% of cases
  const fetchPage = async (page: number): Promise<GitHubRepo[]> => {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      }
    )
    if (!res.ok) return []
    return res.json()
  }

  const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)])
  const all = [...page1, ...page2]

  // Private repos are excluded, not just unverifiable -- Markee's whole point is public visibility,
  // so linking a private repo's file never made sense even before the OAuth scope narrowed to
  // public_repo. register-markee enforces this too (defense in depth); filtering here means a user
  // never sees a repo they couldn't actually link in the first place.
  const repos = all
    .filter(r => !r.private)
    .map(r => ({
      id: r.id,
      fullName: r.full_name,
      name: r.name,
      owner: r.owner.login,
      avatarUrl: r.owner.avatar_url,
      htmlUrl: r.html_url,
      description: r.description,
      private: r.private,
    }))

  return NextResponse.json({ repos })
}
