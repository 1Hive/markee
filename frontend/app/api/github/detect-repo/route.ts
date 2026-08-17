// app/api/github/detect-repo/route.ts
//
// Given a bare repo URL (no OAuth flow required), fetches package.json and infers the
// framework/wallet-library answers for the WebsiteEmbedWizard "questions" step instead of making
// the user pick them by hand. Tries the connected GitHub account's token first (covers private repos
// the user already has access to), falling back to an unauthenticated request otherwise -- GitHub
// itself returns 404 (not 403) for private repos to unauthenticated callers, so that ambiguity is
// surfaced to the caller as `needsAuth` rather than a hard error.

import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import type { EmbedFramework, EmbedWallet } from '@/lib/embedPrompt/fragments'

async function getGithubToken(uid: string | undefined): Promise<string | null> {
  if (!uid) return null
  const raw = await kv.get(`github:user:${uid}`)
  if (!raw) return null
  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
  return data?.accessToken ?? null
}

// Accepts a full GitHub URL, "github.com/owner/repo", or bare "owner/repo". The shape checks keep
// user input from reshaping the outbound api.github.com path (query strings, "..", encoded slashes).
const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

function parseRepo(input: string): { owner: string; repo: string } | null {
  let s = input.trim()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '').replace(/^github\.com\//, '')
  const parts = s.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) return null
  return { owner, repo }
}

function detectFramework(deps: Record<string, string>): EmbedFramework | null {
  if (deps.next) return 'nextjs'
  if (deps.vue || deps.nuxt) return 'vue'
  if (deps.react) return 'react'
  return null
}

function detectWallet(deps: Record<string, string>): EmbedWallet | null {
  if (deps['@privy-io/react-auth']) return 'privy'
  if (deps['@rainbow-me/rainbowkit']) return 'rainbowkit'
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const input = searchParams.get('url') ?? ''
  const parsed = parseRepo(input)
  if (!parsed) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 })
  }
  const { owner, repo } = parsed
  const repoFullName = `${owner}/${repo}`

  const uid = request.cookies.get('github_uid')?.value

  try {
    const token = await getGithubToken(uid)
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const encodedRepoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

    const repoRes = await fetch(`https://api.github.com/repos/${encodedRepoPath}`, {
      headers: { Accept: 'application/vnd.github+json', ...authHeaders },
      signal: AbortSignal.timeout(10_000),
    })

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        // GitHub deliberately can't distinguish "doesn't exist" from "private, no access" here.
        return NextResponse.json({ error: 'not_found_or_private', needsAuth: !token }, { status: 404 })
      }
      return NextResponse.json({ error: `GitHub error (${repoRes.status})` }, { status: 502 })
    }

    const repoData = await repoRes.json()
    const defaultBranch: string = repoData.default_branch ?? 'main'

    const pkgRes = await fetch(
      `https://api.github.com/repos/${encodedRepoPath}/contents/package.json?ref=${encodeURIComponent(defaultBranch)}`,
      { headers: { Accept: 'application/vnd.github.v3.raw', ...authHeaders }, signal: AbortSignal.timeout(10_000) },
    )

    if (!pkgRes.ok) {
      return NextResponse.json({ repoFullName, defaultBranch, framework: null, wallet: null, packageJsonFound: false })
    }

    const pkg = JSON.parse(await pkgRes.text())
    const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }
    return NextResponse.json({
      repoFullName,
      defaultBranch,
      framework: detectFramework(deps),
      wallet: detectWallet(deps),
      packageJsonFound: true,
    })
  } catch (err) {
    // Malformed package.json lands here too -- indistinguishable from "nothing to detect" for the
    // wizard, which falls back to manual selection either way.
    console.error('[github/detect-repo] error:', err)
    return NextResponse.json({ repoFullName, defaultBranch: 'main', framework: null, wallet: null, packageJsonFound: false })
  }
}
