/**
 * GET /api/openinternet/check-health?url=https://gitcoin.co
 *
 * Server-side probe of the integration's /api/markee/health endpoint, so the browser doesn't need
 * CORS access to the integration site. Only the site's origin is used, the host must resolve to
 * public addresses on every hop, and only the known health fields are returned. Results are cached
 * for 60 seconds per origin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkIntegrationHealth } from '@/lib/openinternet/health'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const result = await checkIntegrationHealth(req, req.nextUrl.searchParams.get('url'))
  return NextResponse.json(result.body, { status: result.status })
}
