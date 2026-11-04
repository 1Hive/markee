import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { randomUUID } from 'node:crypto'
import { automaticDeps, automaticAuthDeps, autoEnabled, checkDraft, contentHash, overrideKey, checkPublished } from '@/lib/moderation/automatic'
import { falsePositiveMessage } from '@/lib/moderation/automatic-message'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { clientIp } from '@/lib/rate-limit'
import { readLimitedJsonBody } from '@/lib/sdk/gardens/body'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  try {
    if (!autoEnabled()) return NextResponse.json({ error: 'Automatic moderation is disabled' }, { status: 404 })
    if (!await automaticAuthDeps.underRateLimit('moderation:false-positive', clientIp(req), 30, 60)) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    const { chainId, markee, contentHash: hash, timestamp, moderator, signature } = await readLimitedJsonBody(req, 4096) as Record<string, unknown>
    if (chainId !== 8453 || typeof markee !== 'string' || !ADDRESS_PATTERN.test(markee) || typeof moderator !== 'string' || !ADDRESS_PATTERN.test(moderator) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || typeof signature !== 'string' || !/^0x[0-9a-f]+$/i.test(signature) || typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp)) return NextResponse.json({ error: 'Invalid authorization' }, { status: 400 })
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return NextResponse.json({ error: 'Signature expired' }, { status: 401 })
    if (!await verifyMessage({ address: moderator as `0x${string}`, signature: signature as `0x${string}`, message: falsePositiveMessage(chainId, markee, hash, timestamp) }).catch(() => false)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    const { scopes } = await automaticAuthDeps.authorizedScopes(moderator, [markee])
    if (!scopes.has(markee.toLowerCase())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const [current] = await automaticDeps.read([markee])
    if (contentHash(current.message) !== hash) return NextResponse.json({ error: 'Message changed. Refresh and review again.' }, { status: 409 })
    if (checkDraft(current.message).state !== 'soft-flagged') return NextResponse.json({ error: 'This message is not soft-flagged' }, { status: 409 })
    const pipeline = automaticDeps.pipeline()
    pipeline.set(overrideKey(markee, hash), { moderator: moderator.toLowerCase(), contentHash: hash, scope: 'site', at: timestamp })
    pipeline.set('sdk:snapshots:generation', randomUUID())
    await pipeline.exec()
    await checkPublished([markee])
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Unable to approve false positive' }, { status: 503 }) }
}
