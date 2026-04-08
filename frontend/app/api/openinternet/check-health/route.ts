/**
 * GET /api/openinternet/check-health?url=https://gitcoin.co
 *
 * Server-side proxy that fetches the integration's /api/markee/health endpoint.
 * Runs server-side so the browser doesn't need CORS access to the integration site.
 * Cached for 60 seconds to avoid hammering remote endpoints on every page load.
 */

import { NextRequest, NextResponse } from 'next/server'

// Basic guard against SSRF to internal network addresses
function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost') return false
    if (/^127\./.test(host)) return false
    if (/^10\./.test(host)) return false
    if (/^192\.168\./.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
    return true
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  if (!isSafeUrl(url)) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  const healthUrl = `${url.replace(/\/$/, '')}/api/markee/health`

  try {
    const res = await fetch(healthUrl, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    })

    if (res.status === 404) {
      return NextResponse.json({
        overall: 'unknown',
        message: 'Health endpoint not found — integration may not have implemented /api/markee/health yet',
      })
    }

    if (!res.ok) {
      return NextResponse.json({
        overall: 'error',
        message: `Integration health endpoint returned HTTP ${res.status}`,
      })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error && err.name === 'TimeoutError'
      ? 'Integration health endpoint timed out'
      : 'Could not reach integration health endpoint'
    return NextResponse.json({ overall: 'error', message: msg })
  }
}
