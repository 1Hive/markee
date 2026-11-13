import 'server-only'
import { verifyMessage } from 'viem'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { getModerationClient, readBoardOwners } from '@/lib/moderation/server'

const SIGNATURE_WINDOW_SECONDS = 300

type SignedMessage = { address: `0x${string}`; message: string; signature: `0x${string}` }

export const boardAdminDeps = {
  readBoardOwners,
  contractSignatureValid: (args: SignedMessage) => getModerationClient().verifyMessage(args),
}

export interface BoardAdminProof {
  owner?: unknown
  signature?: unknown
  timestamp?: unknown
}

export interface BoardAdminDenial {
  error: string
  status: number
}

async function signedBy(args: SignedMessage): Promise<boolean> {
  if (await verifyMessage(args).catch(() => false)) return true
  return boardAdminDeps.contractSignatureValid(args).catch(() => false)
}

// Checks that `proof` is a fresh signature of `message(timestamp)` by the board's current on-chain
// admin. Smart-contract admins are verified through ERC-1271. Returns null when authorized.
export async function boardAdminDenial(
  board: string,
  proof: BoardAdminProof,
  message: (timestamp: number) => string,
  action: string,
): Promise<BoardAdminDenial | null> {
  const owner = typeof proof.owner === 'string' ? proof.owner.toLowerCase() : ''
  if (!ADDRESS_PATTERN.test(owner)) return { error: `Sign with this board's admin wallet to ${action}`, status: 400 }
  const { signature, timestamp } = proof
  if (typeof signature !== 'string' || !signature.startsWith('0x') || typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp))
    return { error: 'Missing signature or timestamp', status: 400 }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_WINDOW_SECONDS)
    return { error: 'Signature expired', status: 401 }
  if (!await signedBy({ address: owner as `0x${string}`, message: message(timestamp), signature: signature as `0x${string}` }))
    return { error: 'Invalid signature', status: 401 }
  const [owners] = await boardAdminDeps.readBoardOwners([board.toLowerCase()])
  if (!owners?.includes(owner)) return { error: `Only this board's admin can ${action}`, status: 403 }
  return null
}
