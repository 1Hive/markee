import { NextRequest, NextResponse } from 'next/server'
import { checkDraft, checkPublished, autoEnabled, automaticAuthDeps } from '@/lib/moderation/automatic'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { underRateLimit, clientIp } from '@/lib/rate-limit'
import { readLimitedJsonBody, RequestBodyTooLargeError } from '@/lib/sdk/gardens/body'
export const dynamic = 'force-dynamic'
const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
export function OPTIONS() { return new NextResponse(null, { status: 204, headers }) }
export async function POST(req: NextRequest) {
  try {
    if (autoEnabled() && !await automaticAuthDeps.underRateLimit('moderation:check', clientIp(req), 120, 60)) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers })
    const body = await readLimitedJsonBody(req, 16 * 1024) as Record<string, unknown>
    if (body?.kind === 'draft' && typeof body.message === 'string' && Buffer.byteLength(body.message) <= 4096) return NextResponse.json(checkDraft(body.message), { headers })
    if (body?.kind === 'published' && body.chainId === 8453 && Array.isArray(body.markeeIds) && body.markeeIds.length > 0 && body.markeeIds.length <= 50 && body.markeeIds.every(id => typeof id === 'string' && ADDRESS_PATTERN.test(id))) {
      const items = await checkPublished([...new Set((body.markeeIds as string[]).map(id => id.toLowerCase()))])
      return NextResponse.json({ enabled: autoEnabled(), items }, { headers })
    }
    return NextResponse.json({ error: 'Invalid moderation request' }, { status: 400, headers })
  } catch (error) { return NextResponse.json({ error: error instanceof RequestBodyTooLargeError ? 'Request body is too large.' : error instanceof SyntaxError ? 'Invalid JSON request.' : 'Moderation check unavailable' }, { status: error instanceof RequestBodyTooLargeError ? 413 : error instanceof SyntaxError ? 400 : 503, headers }) }
}
