import { randomBytes } from 'node:crypto';
import { createWalletClient, getAddress, http, isHex, zeroAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Placement } from '../../../packages/sdk/src/types';
import { getEnvPublicClient, getRpcUrlForChain, resolveClientChain } from './chains';
import { consumeMarkeeChallenge, reserveMarkeeChallengeIssue, saveMarkeeChallenge } from './gardens/challenge-store';
import { recordAdminBroadcast } from './operations';
import { platformAdapter, platformCommunity, platformEnabled, platformIdHash, platformKey, registrarABI, registrarAddress, type PlatformPlacement, type Strategy } from './platforms';
import { address, object, placement, SDKError } from './validation';

const namespace = 'platform-activate-direct-v2';
const ttl = 300;
const types = { PlatformActivation: [
  { name: 'communityKey', type: 'bytes32' }, { name: 'platformId', type: 'bytes32' },
  { name: 'identityChainId', type: 'uint256' }, { name: 'communityId', type: 'bytes32' },
  { name: 'strategy', type: 'uint8' }, { name: 'activator', type: 'address' }, { name: 'beneficiary', type: 'address' },
  { name: 'factory', type: 'address' }, { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
] } as const;
type Challenge = {
  placement: PlatformPlacement; account: Address; beneficiary: Address; strategy: Strategy;
  registrar: Address; factory: Address; nonce: string; deadline: number;
  message: { communityKey: Hex; platformId: Hex; identityChainId: bigint; communityId: Hex;
    strategy: number; activator: Address; beneficiary: Address; factory: Address; nonce: bigint; deadline: bigint };
};
const strategyNumber = (strategy: Strategy) => strategy === 'sale' ? 1 : 2;
function operatorAccount() {
  const key = process.env.MARKEE_GENERIC_OPERATOR_PRIVATE_KEY_BASE?.trim();
  if (!key || !/^0x[\da-f]{64}$/i.test(key)) throw new SDKError('PLATFORM_NOT_CONFIGURED', 'The generic community operator is not configured.', 503);
  return privateKeyToAccount(key as Hex);
}
function domain(c: Challenge) {
  return { name: 'Markee Platform Community', version: '2', chainId: c.placement.chainId,
    verifyingContract: c.placement.platformId === 'gardens' ? getAddress(c.placement.communityId) : c.registrar } as const;
}
async function currentFactory(registrar: Address, strategy: Strategy) {
  return getEnvPublicClient(8453).readContract({ address: registrar, abi: registrarABI, functionName: strategy === 'sale' ? 'saleFactory' : 'rentFactory' });
}
function parseChallenge(raw: unknown) {
  const body = object(raw);
  const p: Placement = placement(body.placement);
  if (p.kind !== 'platform-community') throw new SDKError('INVALID_PLACEMENT', 'A platform community is required.');
  if (body.strategy !== 'sale' && body.strategy !== 'rent') throw new SDKError('INVALID_STRATEGY', 'Choose For Sale or For Rent.');
  return { placement: p, strategy: body.strategy as Strategy, account: address(body.account), beneficiary: address(body.beneficiary) };
}
export async function platformActivate(raw: unknown): Promise<Record<string, unknown>> {
  const body = object(raw);
  if (body.action === 'challenge') {
    const request = parseChallenge(body);
    if (!platformEnabled(request.placement)) throw new SDKError('PLATFORM_DISABLED', 'Platform activation is not enabled.', 503);
    const registrar = registrarAddress();
    const operator = operatorAccount();
    await reserveMarkeeChallengeIssue({ namespace, subject: `${platformKey(request.placement)}:${request.account}` });
    const [community, authority, operatorEnabled, factory] = await Promise.all([
      platformCommunity(request.placement), platformAdapter(request.placement).authority(request.placement, request.account),
      getEnvPublicClient(8453).readContract({ address: registrar, abi: registrarABI, functionName: 'operators', args: [operator.address] }),
      currentFactory(registrar, request.strategy),
    ]);
    if (community.integration.status !== 'not_integrated') throw new SDKError('ALREADY_ACTIVE', 'This community already has a Markee board.', 409);
    if (!authority.authorized) throw new SDKError('NOT_AUTHORIZED', 'The connected wallet cannot activate this community.', 403);
    if (!operatorEnabled || factory === zeroAddress) throw new SDKError('PLATFORM_NOT_CONFIGURED', 'Community creation is not enabled.', 503);
    const nonce = BigInt(`0x${randomBytes(32).toString('hex')}`) || 1n;
    const deadline = Math.floor(Date.now() / 1000) + ttl;
    const challenge: Challenge = { ...request, registrar, factory,
      nonce: nonce.toString(), deadline, message: { communityKey: platformKey(request.placement),
        platformId: platformIdHash(request.placement.platformId), identityChainId: BigInt(request.placement.chainId),
        communityId: platformAdapter(request.placement).communityId(request.placement),
        strategy: strategyNumber(request.strategy), activator: request.account, beneficiary: request.beneficiary, factory, nonce, deadline: BigInt(deadline) } };
    await saveMarkeeChallenge({ namespace, nonce: challenge.nonce, ttlSeconds: ttl, value: challenge });
    return { nonce: challenge.nonce, typedData: { domain: domain(challenge), types,
      primaryType: 'PlatformActivation', message: { ...challenge.message,
        identityChainId: challenge.message.identityChainId.toString(), nonce: nonce.toString(), deadline: String(deadline) } } };
  }
  if (body.action !== 'verify' || typeof body.nonce !== 'string' || !/^[1-9][0-9]{0,77}$/.test(body.nonce)
    || typeof body.signature !== 'string' || !isHex(body.signature)) throw new SDKError('INVALID_AUTHORIZATION', 'Invalid authorization request.');
  const challenge = await consumeMarkeeChallenge<Challenge>({ namespace, nonce: body.nonce });
  if (!challenge || challenge.deadline <= Math.floor(Date.now() / 1000)) throw new SDKError('AUTHORIZATION_EXPIRED', 'Authorization expired or was already used.', 401);
  if (!platformEnabled(challenge.placement)) throw new SDKError('PLATFORM_DISABLED', 'Platform activation is not enabled.', 503);
  const current = await platformCommunity(challenge.placement, challenge.account);
  if (current.integration.status !== 'not_integrated') throw new SDKError('ALREADY_ACTIVE', 'This community already has a Markee board.', 409);
  if (!current.permissions?.canActivate) throw new SDKError('AUTHORIZATION_CHANGED', 'Community permissions changed. Request a new authorization.', 409);
  if (registrarAddress() !== challenge.registrar || await currentFactory(challenge.registrar, challenge.strategy) !== challenge.factory) throw new SDKError('AUTHORIZATION_CHANGED', 'The community registrar changed. Request a new authorization.', 409);
  const client = getEnvPublicClient(challenge.placement.chainId);
  if (!await client.verifyTypedData({ address: challenge.account, domain: domain(challenge), types,
    primaryType: 'PlatformActivation', message: challenge.message, signature: body.signature as Hex })) throw new SDKError('INVALID_SIGNATURE', 'Invalid authorization signature.', 401);
  const account = operatorAccount();
  if (!await getEnvPublicClient(8453).readContract({ address: challenge.registrar, abi: registrarABI, functionName: 'operators', args: [account.address] })) throw new SDKError('PLATFORM_NOT_CONFIGURED', 'Community operator is no longer authorized.', 503);
  const base = getEnvPublicClient(8453);
  const args = [platformIdHash(challenge.placement.platformId), BigInt(challenge.placement.chainId), challenge.message.communityId,
    strategyNumber(challenge.strategy), challenge.account, challenge.beneficiary,
    `${challenge.placement.platformId} community ${challenge.placement.communityId}`,
    challenge.placement.platformId, challenge.placement.communityId] as const;
  const simulation = await base.simulateContract({ account, address: challenge.registrar, abi: registrarABI, functionName: 'createBoard', args });
  const gas = (await base.estimateContractGas(simulation.request) * 125n + 99n) / 100n;
  const gasPrice = await base.getGasPrice();
  if (await base.getBalance({ address: account.address }) < gas * gasPrice * 125n / 100n) throw new SDKError('OPERATOR_UNFUNDED', 'Community operator needs more Base ETH.', 503);
  const wallet = createWalletClient({ account, chain: resolveClientChain(8453), transport: http(getRpcUrlForChain(8453)) });
  const transactionHash = await wallet.writeContract({ ...simulation.request, gas });
  await recordAdminBroadcast({ transactionHash, markeeChainId: 8453, platformId: challenge.placement.platformId,
    chainId: challenge.placement.chainId, communityId: challenge.placement.communityId });
  const receipt = await base.waitForTransactionReceipt({ hash: transactionHash, timeout: 30_000 });
  if (receipt.status !== 'success') throw new SDKError('ACTIVATION_REVERTED', 'Community activation reverted.', 502);
  return { transactionHash, markeeChainId: 8453, platformId: challenge.placement.platformId,
    chainId: challenge.placement.chainId, communityId: challenge.placement.communityId };
}
