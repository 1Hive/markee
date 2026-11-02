import type { Hex } from 'viem';
import type { BridgeStatus, ClaimQuote } from '../../../packages/sdk/src/types';
import { getEnvPublicClient, resolveClientChain } from './chains';
import { getSquidClaimBridgeStatus } from './gardens/revenue';
import { SDKError } from './validation';

const safeUrl = (value: unknown) => typeof value === 'string' && value.startsWith('https://') ? value : null;
export function lifiStatus(status: string, substatus?: string): BridgeStatus['status'] {
  if (substatus === 'REFUNDED') return 'refund';
  if (substatus === 'PARTIAL') return 'partial_success';
  if (status === 'DONE' && substatus === 'COMPLETED') return 'success';
  if (status === 'PENDING') return 'ongoing';
  if (status === 'NOT_FOUND') return 'not_found';
  return 'unknown';
}
export async function bridgeStatus(protocol: ClaimQuote['bridgeProtocol'], hash: Hex, from: number, to: number): Promise<BridgeStatus> {
  const sourceTransactionUrl = `${resolveClientChain(from).blockExplorers!.default.url}/tx/${hash}`;
  const base: BridgeStatus = { status: 'ongoing', sourceTransactionUrl, destinationTransactionUrl: null };
  if (protocol === 'squid') return getSquidClaimBridgeStatus({ transactionHash: hash, fromChainId: from, toChainId: to });
  if (protocol === 'none') {
    try {
      const receipt = await getEnvPublicClient(from).getTransactionReceipt({ hash });
      return { ...base, status: receipt.status === 'success' ? 'success' : 'unknown' };
    } catch (error) { if ((error as Error).name === 'TransactionReceiptNotFoundError') return base; throw error; }
  }
  let url: string;
  const headers: Record<string, string> = {};
  if (protocol === 'lifi') {
    url = `https://li.quest/v1/status?${new URLSearchParams({ txHash: hash, fromChain: String(from), toChain: String(to) })}`;
    if (process.env.LIFI_GARDENS_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_GARDENS_API_KEY;
  } else {
    const params = new URLSearchParams({ depositTxnRef: hash });
    if (process.env.ACROSS_INTEGRATOR_ID) params.set('integratorId', process.env.ACROSS_INTEGRATOR_ID);
    if (process.env.ACROSS_API_KEY) headers.Authorization = `Bearer ${process.env.ACROSS_API_KEY}`;
    url = `https://${from === 11155111 ? 'testnet' : 'app'}.across.to/api/deposit/status?${params}`;
  }
  const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  if (response.status === 404) return { ...base, status: 'not_found' };
  if (!response.ok) throw new SDKError('BRIDGE_UNAVAILABLE', 'Bridge status is temporarily unavailable.', 502);
  const data = await response.json();
  if (protocol === 'lifi') return { ...base, status: lifiStatus(data.status, data.substatus), destinationTransactionUrl: safeUrl(data.receiving?.txLink) };
  const status: BridgeStatus['status'] = data.status === 'filled' ? (data.actionsSucceeded === false ? 'partial_success' : 'success') : data.status === 'refunded' ? 'refund' : ['pending', 'received'].includes(data.status) ? 'ongoing' : 'unknown';
  const destinationHash = data.fillTxnRef || data.fillTx;
  return { ...base, status, destinationTransactionUrl: typeof destinationHash === 'string' && /^0x[\da-f]{64}$/i.test(destinationHash) ? `${resolveClientChain(to).blockExplorers!.default.url}/tx/${destinationHash}` : null };
}
