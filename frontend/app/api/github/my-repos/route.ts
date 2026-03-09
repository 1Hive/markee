// frontend/app/api/github/my-repos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

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
  const uid = request.cookies.get('github_uid')?.value
  if (!uid) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const raw = await kv.get<string>(`github:user:${uid}`)
  if (!raw) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 })
  }

  const { accessToken } = typeof raw === 'string' ? JSON.parse(raw) : raw

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

  // Return all repos — push access check happens server-side at register time
  const repos = all
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
