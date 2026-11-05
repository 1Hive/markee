import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { randomUUID } from 'node:crypto'
import { automaticDeps, automaticAuthDeps, autoEnabled, checkDraft, contentHash, overrideKey, sharedOverrideKey, checkPublished } from '@/lib/moderation/automatic'
import { approveMessage, falsePositiveMessage } from '@/lib/moderation/automatic-message'
import { itemKey, pendingKey } from '@/lib/moderation/server'
import { ADDRESS_PATTERN, observeMessage, reviewItem } from '@/lib/moderation/queue'
import { clientIp } from '@/lib/rate-limit'
import { readLimitedJsonBody } from '@/lib/sdk/gardens/body'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  try {
    if (!await automaticAuthDeps.underRateLimit('moderation:false-positive', clientIp(req), 30, 60)) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    const { chainId, markee, contentHash: hash, timestamp, moderator, signature, scope = 'site', intent = 'false-positive' } = await readLimitedJsonBody(req, 4096) as Record<string, unknown>
    if (intent !== 'false-positive' && intent !== 'approve') return NextResponse.json({ error: 'Invalid intent' }, { status: 400 })
    if (intent === 'approve' && scope !== 'all') return NextResponse.json({ error: 'Approval requires all scope' }, { status: 400 })
    if (intent === 'false-positive' && !autoEnabled()) return NextResponse.json({ error: 'Automatic moderation is disabled' }, { status: 404 })
    if (scope !== 'site' && scope !== 'all') return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    if (chainId !== 8453 || typeof markee !== 'string' || !ADDRESS_PATTERN.test(markee) || typeof moderator !== 'string' || !ADDRESS_PATTERN.test(moderator) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || typeof signature !== 'string' || !/^0x[0-9a-f]+$/i.test(signature) || typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp)) return NextResponse.json({ error: 'Invalid authorization' }, { status: 400 })
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    if (!await verifyMessage({ address: moderator as `0x${string}`, signature: signature as `0x${string}`, message: intent === 'approve' ? approveMessage(chainId, markee, hash, timestamp) : falsePositiveMessage(chainId, markee, hash, timestamp, scope) }).catch(() => false)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    const { scopes } = await automaticAuthDeps.authorizedScopes(moderator, [markee])
    if (!scopes.has(markee.toLowerCase())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const [current] = await automaticDeps.read([markee])
    if (!current || contentHash(current.message) !== hash) return NextResponse.json({ error: 'Message changed. Refresh and review again.' }, { status: 409 })
    if (intent === 'false-positive' && checkDraft(current.message).state !== 'soft-flagged') return NextResponse.json({ error: 'This message is not soft-flagged' }, { status: 409 })
    const [stored] = intent === 'approve' ? await automaticAuthDeps.readItems([markee]) : []
    if (intent === 'approve' && (!stored || stored.board.toLowerCase() !== current.board.toLowerCase())) return NextResponse.json({ error: 'Queue changed. Refresh and review again.' }, { status: 409 })
    // The queue reads live text; the scanner's stored review may still be an older revision.
    // Rebase its pending scopes before approving the exact on-chain hash signed by this moderator.
    const item = stored ? observeMessage(stored, { ...stored, message: current.message, blockNumber: current.blockNumber ?? stored.blockNumber, at: Math.floor(Date.now() / 1000) }, { flagged: { board: false, site: false }, preexisting: false }) ?? stored : undefined
    const pipeline = automaticDeps.pipeline()
    if (item) {
      // Approval settles pending reviews only; manual flags require explicit unflagging.
      const held = scopes.get(markee.toLowerCase())!.filter(scope => item.reviews[scope].status === 'pending')
      if (held.length) {
        pipeline.set(itemKey(markee), reviewItem(item, 'approve', moderator, Math.floor(Date.now() / 1000), held))
        held.forEach(scope => pipeline.zrem(pendingKey(scope, item.board), item.markee))
      }
    }
    pipeline.set(scope === 'all' ? sharedOverrideKey(markee, hash) : overrideKey(markee, hash), { moderator: moderator.toLowerCase(), contentHash: hash, scope, at: timestamp })
    pipeline.set('sdk:snapshots:generation', randomUUID())
    await pipeline.exec()
    await checkPublished([markee])
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Unable to approve message' }, { status: 503 }) }
}
