import { getAddress, isAddress, zeroAddress, type Address } from 'viem';
import { SDKError } from './validation';

// Project ownership is checked against Giveth on every authorization, never a display cache.
const GRAPHQL_URL = 'https://core.v6.giveth.io/graphql';
const QUERY = 'query MarkeeGivethProject($id: Int!) { project(id: $id) { id status adminUser { id } addresses { networkId chainType address isRecipient } } }';
const USER_QUERY = 'query MarkeeGivethAdmin($id: ID!) { user(publicId: $id) { id wallets { address chainType isPrimary } } }';
const SLUG_QUERY = 'query MarkeeGivethSlug($slug: String!) { projectBySlug(slug: $slug) { id title status } }';
type ProjectResponse = { data?: { project?: {
  id?: string; status?: string; adminUser?: { id?: string };
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
  const result = await queryGiveth(SLUG_QUERY, { slug }) as { data?: { projectBySlug?: { id?: string | number; title?: string; status?: string } | null }; errors?: unknown[] };
  const project = result.data?.projectBySlug;
  const id = String(project?.id ?? '');
  if (result.errors?.length || project?.status !== 'ACTIVE' || !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'No active Giveth project found for this slug.', 503);
  }
  return { id, title: typeof project?.title === 'string' ? project.title : '' };
}

export async function givethProject(id: string): Promise<{ owner: Address; baseRecipient: Address | null }> {
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0 || String(numericId) !== id) {
    throw new SDKError('INVALID_PLACEMENT', 'Invalid Giveth Project ID.', 422);
  }
  const result = await queryGiveth(QUERY, { id: numericId }) as ProjectResponse;
  const project = result.data?.project;
  if (result.errors?.length || !project || project.id !== id || project.status !== 'ACTIVE') {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project is not active or available.', 503);
  }
  const adminId = project.adminUser?.id;
  if (!adminId || !/^[0-9a-f-]{36}$/i.test(adminId)) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project owner is unavailable.', 503);
  }
  const adminResult = await queryGiveth(USER_QUERY, { id: adminId }) as {
    data?: { user?: { id?: string; wallets?: Array<{ address?: string; chainType?: string; isPrimary?: boolean }> } | null };
    errors?: unknown[];
  };
  const wallets = adminResult.data?.user?.wallets?.filter(item => item.chainType === 'EVM') ?? [];
  const owners = wallets.filter(item => item.address && isAddress(item.address) && getAddress(item.address) !== zeroAddress);
  if (adminResult.errors?.length || adminResult.data?.user?.id !== adminId || owners.length !== 1 || wallets.length !== 1) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project owner wallet is unavailable or ambiguous.', 503);
  }
  const baseAddresses = (project.addresses || []).filter(item => item.networkId === 8453 && item.chainType === 'EVM' && item.isRecipient);
  if (baseAddresses.length > 1 || baseAddresses.some(item => !item.address || !isAddress(item.address) || getAddress(item.address) === zeroAddress)) {
    throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth Base recipient is ambiguous.', 503);
  }
  return { owner: getAddress(owners[0].address!), baseRecipient: baseAddresses[0] ? getAddress(baseAddresses[0].address!) : null };
}
