import { createPublicClient, fallback, http, parseAbi, type Chain, type PublicClient } from 'viem';
import { mainnet, base, optimism, arbitrum, gnosis, polygon, celo, sepolia, optimismSepolia, arbitrumSepolia } from 'viem/chains';

const chains: Chain[] = [mainnet, base, optimism, arbitrum, gnosis, polygon, celo, sepolia, optimismSepolia, arbitrumSepolia];
export const chainConfigMap: Record<number, { isTestnet: boolean }> = Object.fromEntries(chains.map(c => [c.id, { isTestnet: !!c.testnet }]));
export function resolveClientChain(chainId = 8453): Chain {
  const chain = chains.find(c => c.id === chainId);
  if (!chain) throw new Error('Unsupported chain.');
  return chain;
}
export function getRpcUrlForChain(chainId = 8453) {
  const chain = resolveClientChain(chainId);
  return process.env[`MARKEE_RPC_${chainId}`] || (chainId === 8453 ? process.env.ALCHEMY_BASE_URL : undefined) || chain.rpcUrls.default.http[0];
}
const clients = new Map<number, PublicClient>();
const BASE_PUBLIC_RPC = 'https://mainnet.base.org';
export function getRpcTransportForChain(chainId = 8453) {
  const rpcUrl = getRpcUrlForChain(chainId);
  const primary = http(rpcUrl, { timeout: 12_000, retryCount: 0, fetchOptions: { cache: 'no-store' } });
  return chainId === base.id && rpcUrl !== BASE_PUBLIC_RPC
    ? fallback([primary, http(BASE_PUBLIC_RPC, { timeout: 12_000, retryCount: 0, fetchOptions: { cache: 'no-store' } })])
    : primary;
}
export function getEnvPublicClient(chainId = 8453): PublicClient {
  if (!clients.has(chainId)) {
    clients.set(chainId, createPublicClient({
      chain: resolveClientChain(chainId), batch: { multicall: { wait: 10, batchSize: 4096 } },
      transport: getRpcTransportForChain(chainId),
    }) as PublicClient);
  }
  return clients.get(chainId)!;
}
export const registryCommunityABI = parseAbi(['function councilSafe() view returns (address)']);
