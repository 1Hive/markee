import { getAddress, isAddress, zeroAddress, type Address } from 'viem';
import { SDKError } from './validation';

// Project ownership is checked against Giveth on every authorization, never a display cache.
const GRAPHQL_URL = 'https://mainnet.serve.giveth.io/graphql';
const QUERY = 'query MarkeeGivethProject($id: Float!) { projectById(id: $id) { id status { symbol } adminUser { walletAddress } addresses { networkId chainType address isRecipient } } }';
const SLUG_QUERY = 'query MarkeeGivethSlug($slug: String!) { projectBySlug(slug: $slug) { id title } }';
type ProjectResponse = { data?: { projectById?: {
  id?: string; status?: { symbol?: string }; adminUser?: { walletAddress?: string };
  addresses?: Array<{ networkId?: number; chainType?: string; address?: string; isRecipient?: boolean }>;
} | null }; errors?: unknown[] };

async function queryGiveth(query: string, variables: Record<string, string | number>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(5_000), cache: 'no-store',
    });
  } catch { throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project lookup is unavailable.', 503); }
  if (!response.ok) throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project lookup is unavailable.', 503);
  try { return await response.json(); }
  catch { throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth returned an invalid project response.', 503); }
}

export async function resolveGivethSlug(slug: string): Promise<{ id: string; title: string }> {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) throw new SDKError('INVALID_PLACEMENT', 'Invalid Giveth project slug.', 422);
  const result = await queryGiveth(SLUG_QUERY, { slug }) as { data?: { projectBySlug?: { id?: string | number; title?: string } | null }; errors?: unknown[] };
  const project = result.data?.projectBySlug;
  const id = String(project?.id ?? '');
  if (result.errors?.length || !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'No active Giveth project found for this slug.', 503);
  }
  await givethProject(id);
  return { id, title: typeof project?.title === 'string' ? project.title : '' };
}

export async function givethProject(id: string): Promise<{ owner: Address; baseRecipient: Address | null }> {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0 || String(numericId) !== id) {
    throw new SDKError('INVALID_PLACEMENT', 'Invalid Giveth Project ID.', 422);
  }
  const result = await queryGiveth(QUERY, { id: numericId }) as ProjectResponse;
  const project = result.data?.projectById;
  if (result.errors?.length || !project || project.id !== id || project.status?.symbol !== 'activate') {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project is not active or available.', 503);
  }
  const owner = project.adminUser?.walletAddress;
  if (!owner || !isAddress(owner) || getAddress(owner) === zeroAddress) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project owner is unavailable.', 503);
  }
  const baseAddresses = (project.addresses || []).filter(item => item.networkId === 8453 && item.chainType === 'EVM' && item.isRecipient);
  if (baseAddresses.length > 1 || baseAddresses.some(item => !item.address || !isAddress(item.address) || getAddress(item.address) === zeroAddress)) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth Base recipient is ambiguous.', 503);
  }
  return { owner: getAddress(owner), baseRecipient: baseAddresses[0] ? getAddress(baseAddresses[0].address!) : null };
}
