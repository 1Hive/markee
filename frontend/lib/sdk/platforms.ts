import { encodeAbiParameters, getAddress, isAddress, keccak256, parseAbi, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
import type { CommunityState, Placement } from '../../../packages/sdk/src/types';
import { getEnvPublicClient, registryCommunityABI } from './chains';
import { SDKError } from './validation';
import { givethProject } from './giveth-project';

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

const registryFactoryABI = parseAbi(['function getCommunityValidity(address) view returns (bool)']);
const projectsABI = parseAbi(['function ownerOf(uint256) view returns (address)']);
const permissionsABI = parseAbi(['function hasPermission(address operator, address account, uint256 projectId, uint256 permissionId, bool includeRoot, bool includeWildcardProjectId) view returns (bool)']);
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
    // The council Safe must authorize through ERC-1271 so its threshold applies.
    return { authorized: same(account, recipient), recipient };
  },
};

const revnet: PlatformAdapter = {
  id: 'revnet',
  communityId(p) { return `0x${projectId(p).toString(16).padStart(64, '0')}` as Hex; },
  async recipient() { return null; },
  async authority(p, account) {
    // Revnet v6 stays disabled until its deployment, projects and
    // explicit operator permission ID have been verified and configured.
    const projects = configuredAddress(`MARKEE_REVNET_V6_PROJECTS_${p.chainId}`);
    const permissions = configuredAddress(`MARKEE_REVNET_V6_PERMISSIONS_${p.chainId}`);
    const permissionId = process.env.MARKEE_REVNET_V6_ADMIN_PERMISSION_ID;
    if (!permissionId || !/^[1-9][0-9]*$/.test(permissionId)) throw new SDKError('PLATFORM_NOT_CONFIGURED', 'Revnet v6 authorization is not configured.', 503);
    const client = getEnvPublicClient(p.chainId);
    const owner = await client.readContract({ address: projects, abi: projectsABI, functionName: 'ownerOf', args: [projectId(p)] });
    // Root delegation follows the project owner; wildcard project grants would authorize unrelated communities.
    const delegated = same(owner, account) ? false : await client.readContract({ address: permissions, abi: permissionsABI, functionName: 'hasPermission', args: [account, owner, projectId(p), BigInt(permissionId), true, false] });
    // The beneficiary is selected on Base during activation; a Revnet terminal is not the payout route.
    return { authorized: same(owner, account) || delegated, recipient: null };
  },
};

const giveth: PlatformAdapter = {
  id: 'giveth',
  communityId(p) { return `0x${projectId(p).toString(16).padStart(64, '0')}` as Hex; },
  async recipient(p) { return (await givethProject(p.communityId)).baseRecipient; },
  async authority(p, account) {
    const project = await givethProject(p.communityId);
    // A Base beneficiary is chosen explicitly during activation. Giveth's
    // configured Base recipient is informational, not a silent default.
    return { authorized: same(project.owner, account), recipient: project.baseRecipient };
  },
};

export function platformAdapter(p: PlatformPlacement): PlatformAdapter {
  if (p.platformId === 'gardens') return gardens;
  if (p.platformId === 'revnet') return revnet;
  if (p.platformId === 'giveth') return giveth;
  throw new SDKError('UNSUPPORTED_PLATFORM', 'This platform is not enabled.', 422);
}
export const platformIdHash = (id: string) => keccak256(stringToHex(id));
/** Factory platform tags are capped at 31 bytes; the registrar key remains the authoritative identity. */
export function platformTag(p: PlatformIdentity): string {
  const id = p.platformId === 'gardens' ? getAddress(p.communityId).toLowerCase() : projectId(p).toString();
  return id.slice(0, 31);
}
export function platformKey(p: PlatformPlacement): Hex {
  if (!['gardens', 'revnet', 'giveth'].includes(p.platformId)) throw new SDKError('UNSUPPORTED_PLATFORM', 'Unknown platform.', 422);
  const id = p.platformId === 'gardens' ? gardens.communityId(p) : `0x${projectId(p).toString(16).padStart(64, '0')}` as Hex;
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }], [platformIdHash(p.platformId), BigInt(p.chainId), id]));
}
export const registrarABI = parseAbi([
  'function integrations(bytes32) view returns (address board, address seedMarkee, uint8 strategy, address activator, address initialBeneficiary)',
  'function operators(address) view returns (bool)',
  'function saleFactory() view returns (address)',
  'function rentFactory() view returns (address)',
  'function createBoard(bytes32 platformId, uint256 chainId, bytes32 communityId, uint8 strategy, address activator, address beneficiary, string name, string platformName, string platformKey) returns ((address board, address seedMarkee, uint8 strategy, address activator, address initialBeneficiary))',
]);
const boardAdminABI = parseAbi(['function admin() view returns (address)', 'function beneficiaryAddress() view returns (address)']);
export function platformEnabled(p: PlatformPlacement): boolean {
  // Explicit server-side rollout gates; the client cannot enable a platform.
  return p.platformId === 'gardens' ? process.env.MARKEE_PLATFORM_GARDENS_ENABLED === 'true'
    : p.platformId === 'revnet' ? process.env.MARKEE_PLATFORM_REVNET_ENABLED === 'true'
    : p.platformId === 'giveth' && process.env.MARKEE_PLATFORM_GIVETH_ENABLED === 'true';
}
export function registrarAddress(): Address {
  return configuredAddress('MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE');
}
export async function platformCommunity(p: PlatformPlacement, account?: Address): Promise<CommunityState> {
  const key = platformKey(p);
  const enabled = platformEnabled(p);
  const registrar = process.env.MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE;
  if (!registrar && enabled) throw new SDKError('PLATFORM_NOT_CONFIGURED', 'Platform board registrar is not configured.', 503);
  const base = getEnvPublicClient(8453);
  const integration = registrar ? await base.readContract({ address: registrarAddress(), abi: registrarABI, functionName: 'integrations', args: [key] }) : null;
  const board = integration && integration[0] !== zeroAddress ? getAddress(integration[0]) : null;
  const [admin, beneficiary, authority] = await Promise.all([
    board ? base.readContract({ address: board, abi: boardAdminABI, functionName: 'admin' }) : null,
    board ? base.readContract({ address: board, abi: boardAdminABI, functionName: 'beneficiaryAddress' }) : null,
    account && enabled && !board ? platformAdapter(p).authority(p, account) : null,
  ]);
  const status = board ? (admin && integration && same(admin, integration[3]) ? 'active' : 'pending_admin') : enabled ? 'not_integrated' : 'disabled';
  return {
    integration: { status, leaderboardAddress: board, vaultAddress: null },
    markeeChainId: 8453,
    revenue: { claimableAmount: '0', symbol: 'ETH' },
    permissions: account ? { canActivate: !!authority?.authorized && !board, canClaim: false, councilSafe: null } : undefined,
    platform: { id: p.platformId, communityId: p.communityId, destinationChainId: p.chainId, recipient: p.platformId === 'giveth' ? authority?.recipient ?? null : null,
      enabled, beneficiary: beneficiary ? getAddress(beneficiary) : null, boardOwner: integration && integration[3] !== zeroAddress ? getAddress(integration[3]) : null },
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
