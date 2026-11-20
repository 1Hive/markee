import 'server-only'
import { ADDRESS_PATTERN } from '@/lib/moderation/queue'
import { authorizeWallet } from '@/lib/auth/wallet-session'
import { getModerationClient, readBoardAdmin } from '@/lib/moderation/server'

const SIGNATURE_WINDOW_SECONDS = 300

type SignedMessage = { address: `0x${string}`; message: string; signature: `0x${string}` }

export const boardAdminDeps = {
  readBoardAdmin,
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
  code?: string
}

// Checks that the caller is the board's current on-chain admin, proven by a Privy session with that
// wallet linked or by a fresh signature of `message(timestamp)`. Smart-contract admins sign through
// ERC-1271. Returns null when authorized.
export async function boardAdminDenial(
  request: Request,
  board: string,
  proof: BoardAdminProof,
  message: (timestamp: number) => string,
  action: string,
): Promise<BoardAdminDenial | null> {
  const owner = typeof proof.owner === 'string' ? proof.owner.toLowerCase() : ''
  if (!ADDRESS_PATTERN.test(owner)) return { error: `Sign with this board's admin wallet to ${action}`, status: 400 }
  const { signature, timestamp } = proof
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp))
    return { error: 'Missing signature or timestamp', status: 400 }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_WINDOW_SECONDS)
    return { error: 'Signature expired', status: 401 }
  const auth = await authorizeWallet(request, owner, signature, () => message(timestamp))
  if (!auth.ok) {
    // Not a session wallet or an EOA signature; a contract admin (a multisig) may still have signed.
    const contractSigned = auth.status === 401 && typeof signature === 'string' && /^0x[0-9a-fA-F]+$/.test(signature)
      && await boardAdminDeps.contractSignatureValid({ address: owner as `0x${string}`, message: message(timestamp), signature: signature as `0x${string}` }).catch(() => false)
    if (!contractSigned) return { ...auth.body, status: auth.status }
  }
  let admin: string | null
  try {
    admin = await boardAdminDeps.readBoardAdmin(board.toLowerCase())
  } catch {
    return { error: "Could not read this board's admin. Try again in a moment.", status: 503 }
  }
  if (admin !== owner) return { error: `Only this board's admin can ${action}`, status: 403 }
  return null
}
