import { NextRequest, NextResponse } from 'next/server'
import { checkDraft, checkPublished, autoEnabled, automaticAuthDeps } from '@/lib/moderation/automatic'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { clientIp } from '@/lib/rate-limit'
import { readLimitedJsonBody, RequestBodyTooLargeError } from '@/lib/sdk/gardens/body'
import { versionedModerationPolicy } from '@/lib/moderation/severity'
import { boardModerationPolicy } from '@/lib/moderation/board-policy'
import { placement } from '@/lib/sdk/validation'
import { resolvePlacement } from '@/lib/sdk/snapshot'
export const dynamic = 'force-dynamic'
const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
export function OPTIONS() { return new NextResponse(null, { status: 204, headers }) }
export async function POST(req: NextRequest) {
  try {
    if (autoEnabled() && !await automaticAuthDeps.underRateLimit('moderation:check', clientIp(req), 120, 60)) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers })
    const body = await readLimitedJsonBody(req, 16 * 1024) as Record<string, unknown>
    let severity
    try { severity = versionedModerationPolicy(body?.policy, body?.severity, body?.rules) } catch { return NextResponse.json({ error: 'Invalid moderation policy or rules' }, { status: 400, headers }) }
    if (body?.placement !== undefined) {
      try { const p = placement(body.placement); const resolved = await resolvePlacement(p); severity = await boardModerationPolicy(resolved.board, body.policy, body.severity, body.rules) }
      catch { return NextResponse.json({ error: 'Moderation setting unavailable' }, { status: 503, headers }) }
    }
    const isDraft = body?.kind === 'draft' && typeof body.message === 'string' && Buffer.byteLength(body.message) <= 4096
    const isPublished = body?.kind === 'published' && body.chainId === 8453 && Array.isArray(body.markeeIds)
      && body.markeeIds.length > 0 && body.markeeIds.length <= 50
      && body.markeeIds.every(id => typeof id === 'string' && ADDRESS_PATTERN.test(id))
    if (isDraft) return NextResponse.json(checkDraft(body.message as string, severity), { headers })
    if (isPublished) {
      const items = await checkPublished([...new Set((body.markeeIds as string[]).map(id => id.toLowerCase()))], board => boardModerationPolicy(board, body.policy, body.severity, body.rules))
      return NextResponse.json({ enabled: autoEnabled(), items }, { headers })
    }
    return NextResponse.json({ error: 'Invalid moderation request' }, { status: 400, headers })
  } catch (error) { return NextResponse.json({ error: error instanceof RequestBodyTooLargeError ? 'Request body is too large.' : error instanceof SyntaxError ? 'Invalid JSON request.' : 'Moderation check unavailable' }, { status: error instanceof RequestBodyTooLargeError ? 413 : error instanceof SyntaxError ? 400 : 503, headers }) }
}
