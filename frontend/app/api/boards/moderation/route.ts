import { NextResponse } from 'next/server'
import { metaWriteDeps } from '@/lib/openinternet/meta-deps'
import { boardModerationPolicy, boardPolicyDeps, boardPolicyKey } from '@/lib/moderation/board-policy'
import { versionedModerationPolicy } from '@/lib/moderation/severity'
import { boardPolicyMessage } from '@/lib/moderation/board-policy-message'
import { readLimitedJsonBody } from '@/lib/sdk/gardens/body'
import { authorizeWallet } from '@/lib/auth/wallet-session'

export const dynamic = 'force-dynamic'
const ADDRESS = /^0x[0-9a-f]{40}$/i
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

export async function GET(request: Request) {
  const board = new URL(request.url).searchParams.get('board')
  if (!board || !ADDRESS.test(board)) return NextResponse.json({ error: 'Invalid board' }, { status: 400, headers: NO_CACHE })
  try {
    const saved = await boardPolicyDeps.get(boardPolicyKey(board))
    return NextResponse.json({ policy: saved?.policy ?? { version: 1, severity: 'standard', rules: {} }, severity: await boardModerationPolicy(board), managed: !!saved }, { headers: NO_CACHE })
  } catch { return NextResponse.json({ error: 'Moderation setting unavailable' }, { status: 503, headers: NO_CACHE }) }
}

export async function POST(request: Request) {
  try {
    const body = await readLimitedJsonBody(request, 2048) as Record<string, unknown>
    const { board, owner, signature, timestamp } = body
    if (typeof board !== 'string' || !ADDRESS.test(board) || typeof owner !== 'string' || !ADDRESS.test(owner) ||
      (signature !== undefined && (typeof signature !== 'string' || !/^0x[0-9a-f]+$/i.test(signature))) || typeof timestamp !== 'number' ||
      !Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
      return NextResponse.json({ error: 'Invalid or expired request' }, { status: 400, headers: NO_CACHE })
    }
    const policy = body.policy
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
      Object.keys(policy).some(key => !['version', 'severity', 'rules'].includes(key))) {
      return NextResponse.json({ error: 'Invalid moderation policy' }, { status: 400, headers: NO_CACHE })
    }
    try { versionedModerationPolicy(policy) }
    catch { return NextResponse.json({ error: 'Invalid moderation policy version or rules' }, { status: 400, headers: NO_CACHE }) }
    const [owners] = await metaWriteDeps.readBoardOwners([board.toLowerCase()])
    if (!owners.includes(owner.toLowerCase())) return NextResponse.json({ error: 'Only a board owner can change moderation' }, { status: 403, headers: NO_CACHE })
    const auth = await authorizeWallet(request, owner, signature, () => boardPolicyMessage(board, policy, timestamp))
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status, headers: NO_CACHE })
    const previous = await boardPolicyDeps.get(boardPolicyKey(board))
    if (previous && previous.updatedAt >= timestamp) return NextResponse.json({ error: 'This update is stale' }, { status: 409, headers: NO_CACHE })
    await boardPolicyDeps.set(boardPolicyKey(board), { policy, updatedAt: timestamp })
    return NextResponse.json({ policy, managed: true }, { headers: NO_CACHE })
  } catch {
    return NextResponse.json({ error: 'Could not save moderation setting' }, { status: 503, headers: NO_CACHE })
  }
}
