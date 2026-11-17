import { encodeAbiParameters, getAddress, isAddress, keccak256, parseAbi, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
import type { CommunityState, Placement } from '../../../packages/sdk/src/types';
import { getEnvPublicClient, registryCommunityABI } from './chains';
import { SDKError } from './validation';

export type PlatformPlacement = Extract<Placement, { kind: 'platform-community' }>;
export interface PlatformIdentity { kind: 'platform-community'; platformId: string; chainId: number; communityId: string }
export type Strategy = 'sale' | 'rent';
export interface PlatformAuthority { authorized: boolean; recipient: Address | null }
export interface PlatformAdapter {
  readonly id: string;
  communityId(p: PlatformIdentity): Hex;
  authority(p: PlatformIdentity, account: Address): Promise<PlatformAuthority>;
  recipient(p: PlatformIdentity): Promise<Address | null>;
}

const councilABI = parseAbi(['function isOwner(address) view returns (bool)']);
const registryFactoryABI = parseAbi(['function getCommunityValidity(address) view returns (bool)']);
const projectsABI = parseAbi(['function ownerOf(uint256) view returns (address)']);
const permissionsABI = parseAbi(['function hasPermission(address operator, address account, uint256 projectId, uint256 permissionId, bool includeRoot, bool includeWildcardProjectId) view returns (bool)']);
const directoryABI = parseAbi(['function primaryTerminalOf(uint256 projectId, address token) view returns (address)']);
const nativeToken = '0x000000000000000000000000000000000000EEEe' as Address;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const projectId = (p: PlatformIdentity) => BigInt(p.communityId);
const configuredAddress = (name: string): Address => {
  const value = process.env[name];
  if (!value || !isAddress(value) || getAddress(value) === zeroAddress) throw new SDKError('PLATFORM_NOT_CONFIGURED', `${name} is not configured.`, 503);
  return getAddress(value);
};

const gardens: PlatformAdapter = {
  id: 'gardens',
  communityId(p) { return `0x${BigInt(p.communityId).toString(16).padStart(64, '0')}` as Hex; },
  async recipient(p) {
    const client = getEnvPublicClient(p.chainId);
    const community = getAddress(p.communityId);
    const factory = configuredAddress(`MARKEE_GARDENS_REGISTRY_FACTORY_${p.chainId}`);
    if (!await client.readContract({ address: factory, abi: registryFactoryABI, functionName: 'getCommunityValidity', args: [community] })) {
      throw new SDKError('INVALID_COMMUNITY', 'The Gardens registry does not recognize this community.', 422);
    }
    const safe = await client.readContract({ address: community, abi: registryCommunityABI, functionName: 'councilSafe' });
    return safe === zeroAddress ? null : getAddress(safe);
  },
  async authority(p, account) {
    const recipient = await this.recipient(p);
    if (!recipient) return { authorized: false, recipient };
    const authorized = same(account, recipient) || await getEnvPublicClient(p.chainId).readContract({ address: recipient, abi: councilABI, functionName: 'isOwner', args: [account] });
    return { authorized, recipient };
  },
};

const revnet: PlatformAdapter = {
  id: 'revnet',
  communityId(p) { return `0x${projectId(p).toString(16).padStart(64, '0')}` as Hex; },
  async recipient(p) {
    const directory = configuredAddress(`MARKEE_REVNET_V6_DIRECTORY_${p.chainId}`);
    const terminal = await getEnvPublicClient(p.chainId).readContract({ address: directory, abi: directoryABI, functionName: 'primaryTerminalOf', args: [projectId(p), nativeToken] });
    return terminal === zeroAddress ? null : getAddress(terminal);
  },
  async authority(p, account) {
    // Revnet v6 stays disabled until its deployment, projects, directory and
    // explicit operator permission ID have been verified and configured.
    const projects = configuredAddress(`MARKEE_REVNET_V6_PROJECTS_${p.chainId}`);
    const permissions = configuredAddress(`MARKEE_REVNET_V6_PERMISSIONS_${p.chainId}`);
    const permissionId = process.env.MARKEE_REVNET_V6_ADMIN_PERMISSION_ID;
    if (!permissionId || !/^[1-9][0-9]*$/.test(permissionId)) throw new SDKError('PLATFORM_NOT_CONFIGURED', 'Revnet v6 authorization is not configured.', 503);
    const client = getEnvPublicClient(p.chainId);
    const owner = await client.readContract({ address: projects, abi: projectsABI, functionName: 'ownerOf', args: [projectId(p)] });
    const delegated = same(owner, account) ? false : await client.readContract({ address: permissions, abi: permissionsABI, functionName: 'hasPermission', args: [account, owner, projectId(p), BigInt(permissionId), true, false] });
    return { authorized: same(owner, account) || delegated, recipient: await this.recipient(p) };
  },
};

export function platformAdapter(p: PlatformPlacement): PlatformAdapter {
  if (p.platformId === 'gardens') return gardens;
  if (p.platformId === 'revnet') return revnet;
  throw new SDKError('UNSUPPORTED_PLATFORM', 'This platform is not enabled.', 422);
}
export const platformIdHash = (id: string) => keccak256(stringToHex(id));
export function platformKey(p: PlatformPlacement): Hex {
  const adapter = platformAdapter(p);
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }], [platformIdHash(p.platformId), BigInt(p.chainId), adapter.communityId(p)]));
}
export const registrarABI = parseAbi([
  'function integrations(bytes32) view returns (address vault, address board, address seedMarkee, uint8 strategy)',
  'function operators(address) view returns (bool)',
  'function saleFactory() view returns (address)',
  'function rentFactory() view returns (address)',
  'function createBoard(bytes32 platformId, uint256 chainId, bytes32 communityId, uint8 strategy, string name, string platformName, string platformKey) returns ((address vault, address board, address seedMarkee, uint8 strategy))',
]);
export const vaultABI = parseAbi(['function availableRevenue() view returns (uint256)']);
export function registrarAddress(): Address {
  return configuredAddress('MARKEE_GENERIC_REGISTRAR_ADDRESS_BASE');
}
export async function platformCommunity(p: PlatformPlacement, account?: Address): Promise<CommunityState> {
  const adapter = platformAdapter(p);
  const registrar = registrarAddress();
  const base = getEnvPublicClient(8453);
  const integration = await base.readContract({ address: registrar, abi: registrarABI, functionName: 'integrations', args: [platformKey(p)] });
  const board = integration[1] === zeroAddress ? null : getAddress(integration[1]);
  const vault = integration[0] === zeroAddress ? null : getAddress(integration[0]);
  const [recipient, authority, revenue] = await Promise.all([
    adapter.recipient(p), account ? adapter.authority(p, account) : null,
    vault ? base.readContract({ address: vault, abi: vaultABI, functionName: 'availableRevenue' }) : 0n,
  ]);
  return {
    integration: { status: board ? 'active' : 'not_integrated', leaderboardAddress: board, vaultAddress: vault },
    markeeChainId: 8453,
    revenue: { claimableAmount: revenue.toString(), symbol: 'ETH' },
    permissions: account ? { canActivate: !!authority?.authorized && !board, canClaim: false, councilSafe: p.platformId === 'gardens' ? recipient : null } : undefined,
    platform: { id: p.platformId, communityId: p.communityId, destinationChainId: p.chainId, recipient },
  };
}

/** Design-test only: never register this adapter in platformAdapter(). */
export function givethProjectPrototype(load: (id: string) => Promise<{ active: boolean; owner: Address; baseRecipient: Address } | null>): PlatformAdapter {
  const current = async (p: PlatformIdentity) => {
    const project = await load(p.communityId);
    if (!project || !project.active || !isAddress(project.owner) || !isAddress(project.baseRecipient)
      || project.baseRecipient === zeroAddress) throw new SDKError('PROJECT_UNAVAILABLE', 'Giveth project is unavailable.', 503);
    return project;
  };
  return {
    id: 'giveth',
    communityId(p) { return `0x${projectId(p).toString(16).padStart(64, '0')}` as Hex; },
    async recipient(p) { return (await current(p)).baseRecipient; },
    async authority(p, account) {
      const project = await current(p);
      return { authorized: same(project.owner, account), recipient: project.baseRecipient };
    },
  };
}
