import { isHex, type Hex } from 'viem';
import { getEnvPublicClient } from './chains';
import { platformCommunity } from './platforms';
import { address, placement, SDKError } from './validation';

/** Check a wallet-submitted admin acceptance without trusting its stored transaction hash. */
export async function platformAdminStatus(search: URLSearchParams): Promise<{ status: 'pending' | 'confirmed' | 'reverted' }> {
  let raw: unknown;
  try { raw = JSON.parse(search.get('placement') || '{}'); }
  catch { throw new SDKError('INVALID_PLACEMENT', 'Invalid platform placement.'); }
  const p = placement(raw);
  if (p.kind !== 'platform-community') throw new SDKError('INVALID_PLACEMENT', 'A platform community is required.');
  const account = address(search.get('account'));
  const value = search.get('transactionHash');
  if (!value || !isHex(value) || value.length !== 66) throw new SDKError('INVALID_HASH', 'Invalid transaction hash.');
  const transactionHash = value as Hex;
  const communityState = await platformCommunity(p);
  const board = communityState.integration.leaderboardAddress;
  if (!board || communityState.platform?.boardOwner?.toLowerCase() !== account.toLowerCase()) {
    throw new SDKError('NOT_FOUND', 'No pending board for this account.', 404);
  }
  const base = getEnvPublicClient(8453);
  const transaction = await base.getTransaction({ hash: transactionHash }).catch(() => null);
  if (!transaction) return { status: 'pending' };
  if (transaction.from.toLowerCase() !== account.toLowerCase() || transaction.to?.toLowerCase() !== board.toLowerCase()
    || transaction.input !== '0x0e18b681') throw new SDKError('TRANSACTION_MISMATCH', 'This is not the board-admin acceptance transaction.', 409);
  const receipt = await base.getTransactionReceipt({ hash: transactionHash }).catch(() => null);
  if (!receipt) return { status: 'pending' };
  if (receipt.status !== 'success') return { status: 'reverted' };
  const refreshed = await platformCommunity(p);
  return { status: refreshed.integration.status === 'active' ? 'confirmed' : 'pending' };
}
