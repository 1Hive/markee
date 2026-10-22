import { getAddress, parseAbi, zeroAddress, type Abi, type Address, type PublicClient } from 'viem';
import type { CommunityState, Entry, Placement, Snapshot, WalletState } from '../../../packages/sdk/src/types';
import { MARKEE_TOKEN } from '../contracts/addresses';
import { boardABI, cfaABI, gdaABI, messageABI, poolABI, tokenABI } from './abi';
import { getEnvPublicClient, registryCommunityABI } from './chains';
import { markeeAdapter } from './gardens/revenue';
import { CFA_AGREEMENT_ID, GDA_AGREEMENT_ID, getMarkeeEthxAddress, getMarkeeWithdrawableDeposit, superfluidHostABI } from './gardens/streaming';
import { SDKError } from './validation';
import { readPresentationData } from './presentation-data';
import { displayCache, displayCacheConfigured, displayKey } from './cached-display';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const read = <T>(client: PublicClient, addr: Address, abi: Abi, functionName: string, args: readonly unknown[] = [], blockNumber?: bigint) =>
  client.readContract({ address: addr, abi, functionName, args, blockNumber }) as Promise<T>;
export const snapshotReaders = { presentation: readPresentationData };

export async function communityPermissions(chainId: number, community: Address, account: Address) {
  const client = getEnvPublicClient(chainId);
  const council = await read<Address>(client, community, registryCommunityABI, 'councilSafe');
  const owner = council !== zeroAddress && (same(account, council) || await read<boolean>(client, council, parseAbi(['function isOwner(address) view returns (bool)']), 'isOwner', [account]));
  const { GET } = await import('./gardens/activate');
  const response = await GET(new Request(`http://markee.local/?account=${account}`));
  if (!response.ok) throw new SDKError('PERMISSIONS_UNAVAILABLE', 'Community permissions are temporarily unavailable.', 503);
  const keeper = await response.json();
  return { canActivate: owner || keeper.isKeeper === true, canClaim: owner, councilSafe: council === zeroAddress ? null : council };
}

export async function resolvePlacement(p: Placement, account?: Address) {
  let community: CommunityState | undefined;
  if (p.kind === 'board') return { board: p.address, chainId: p.chainId, community };
  community = await markeeAdapter.getCommunityIntegration(p.chainId, p.community);
  if (account) {
    community.permissions = await communityPermissions(p.chainId, p.community, account);
  }
  return { board: community.integration.leaderboardAddress, chainId: community.markeeChainId, community };
}

export async function boardContext(chainId: number, board: Address, trustedCommunity = false) {
  const client = getEnvPublicClient(chainId);
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const r = <T>(fn: string, args: readonly unknown[] = []) => read<T>(client, board, boardABI, fn, args, blockNumber);
  const [version, factory] = await Promise.all([r<string>('VERSION'), r<Address>('factory')]);
  const strategy: 'sale' | 'rent' | null = version === 'streaming-1.0.0' ? 'rent' : version === '1.3.0' ? 'sale' : null;
  if (!strategy) throw new SDKError('UNSUPPORTED_BOARD', 'This SDK supports Markee v1.3 For Sale and streaming v1 boards.', 422);
  const factories = [chainId === 8453 ? '0x861D9897eC47421aAFB6321Ee219E88ab485121f' : '',
    chainId === 8453 ? '0x37f420fdE5c98e611EB7cb9b74ef579D84697039' : '',
    process.env[`MARKEE_SDK_FACTORIES_${chainId}`] || '',
    process.env[chainId === 8453 ? 'MARKEE_STREAMING_LEADERBOARD_FACTORY_ADDRESS_BASE' : 'MARKEE_STREAMING_LEADERBOARD_FACTORY_ADDRESS_SEPOLIA'] || '',
    chainId === 8453 ? process.env.NEXT_PUBLIC_STREAMING_FACTORY || '' : '',
  ].flatMap(s => s.split(',')).filter(Boolean);
  const roots = ['0x2768BC6e90266248BD8bCF5401C36D8049CdF671', '0x0590b56430426A38D0fA065b839c10D542E75CCD'];
  const trustedRoot = chainId === 8453 && roots.some(a => same(a, board));
  if (!trustedCommunity && !trustedRoot) {
    if (!factories.some(a => same(a.trim(), factory))) throw new SDKError('UNTRUSTED_FACTORY', 'This board factory has not been enabled by Markee.', 422);
    if (!await read<boolean>(client, factory, parseAbi(['function isFactoryLeaderboard(address) view returns (bool)']), 'isFactoryLeaderboard', [board], blockNumber)) throw new SDKError('INVALID_BOARD', 'The factory does not recognize this board.', 422);
  }
  const [name, minimum, maxMessage, maxName, revnetEnabled, count, ranked] = await Promise.all([
    r<string>('leaderboardName'), r<bigint>(strategy === 'rent' ? 'minimumMonthlyRate' : 'minimumPrice'),
    r<bigint>('maxMessageLength'), r<bigint>('maxNameLength'), r<boolean>('revNetEnabled'),
    r<bigint>('markeeCount'), r<[Address[], bigint[]]>('getTopMarkees', [20n]),
  ]);
  const top = strategy === 'rent' ? await r<Address>('topMarkee') : ranked[0][0] || zeroAddress;
  const token = chainId === 8453 ? MARKEE_TOKEN : process.env.MARKEE_SDK_TOKEN_SEPOLIA as Address | undefined;
  return { client, blockNumber, r, chainId, board, strategy, name, minimum, maxMessageBytes: Number(maxMessage), maxNameBytes: Number(maxName), revnetEnabled, count: Number(count), ranked, top, token: token || null };
}
export type BoardContext = Awaited<ReturnType<typeof boardContext>>;

export async function streamContext(c: BoardContext, account: Address) {
  const [ethx, host] = await Promise.all([c.r<Address>('ETHX'), c.r<Address>('HOST')]);
  if (!same(ethx, getMarkeeEthxAddress(c.chainId) || zeroAddress)) throw new SDKError('UNSUPPORTED_TOKEN', 'Unexpected streaming token.', 422);
  const [cfa, gda] = await Promise.all([CFA_AGREEMENT_ID, GDA_AGREEMENT_ID].map(id => read<Address>(c.client, host, superfluidHostABI, 'getAgreementClass', [id], c.blockNumber)));
  const [realtime, flow, backed, deposit, pendingSettlement, cfaNet, gdaNet] = await Promise.all([
    read<readonly [bigint, bigint, bigint, bigint]>(c.client, ethx, tokenABI, 'realtimeBalanceOfNow', [account], c.blockNumber),
    read<readonly [bigint, bigint, bigint, bigint]>(c.client, cfa, cfaABI, 'getFlow', [ethx, account, c.board], c.blockNumber),
    c.r<Address>('backerMarkee', [account]), c.r<bigint>('backerDeposit', [account]), c.r<bigint>('pendingSettlement', [account]),
    read<bigint>(c.client, cfa, cfaABI, 'getNetFlow', [ethx, account], c.blockNumber),
    read<bigint>(c.client, gda, gdaABI, 'getNetFlow', [ethx, account], c.blockNumber),
  ]);
  const pool = backed !== zeroAddress ? await c.r<Address>('poolOf', [backed]) : zeroAddress;
  const [refundRate, poolConnected, poolClaimable] = pool === zeroAddress ? [0n, false, [0n, 0n] as const] : await Promise.all([
    read<bigint>(c.client, pool, poolABI, 'getMemberFlowRate', [account], c.blockNumber),
    read<boolean>(c.client, gda, gdaABI, 'isMemberConnected', [pool, account], c.blockNumber),
    read<readonly [bigint, bigint]>(c.client, pool, poolABI, 'getClaimableNow', [account], c.blockNumber),
  ]);
  return { ethx, host, cfa, gda, available: realtime[0], observedAt: Number(realtime[3]), rate: flow[1], backed, deposit, pendingSettlement, netFlow: cfaNet + gdaNet, pool, refundRate, poolConnected, poolClaimable: poolClaimable[0] };
}

export async function walletState(c: BoardContext, account: Address): Promise<WalletState> {
  const [eth, markee, s] = await Promise.all([
    c.client.getBalance({ address: account, blockNumber: c.blockNumber }),
    c.token ? read<bigint>(c.client, c.token, tokenABI, 'balanceOf', [account], c.blockNumber) : null,
    c.strategy === 'rent' ? streamContext(c, account) : null,
  ]);
  return { address: account, eth: eth.toString(), markee: markee?.toString() ?? null,
    ethx: (s?.available ?? 0n).toString(), backedMarkee: s && s.backed !== zeroAddress ? s.backed : null,
    flowRate: (s?.rate ?? 0n).toString(), deposit: (s?.deposit ?? 0n).toString(),
    withdrawableDeposit: s ? getMarkeeWithdrawableDeposit(s.deposit, s.rate).toString() : '0',
    pendingSettlement: (s?.pendingSettlement ?? 0n).toString(), refundRate: (s?.refundRate ?? 0n).toString(),
    pool: s && s.pool !== zeroAddress ? s.pool : null, poolConnected: s?.poolConnected ?? false,
    poolClaimable: (s?.poolClaimable ?? 0n).toString(), netFlowRate: (s?.netFlow ?? 0n).toString(),
    runwaySeconds: s && s.netFlow < 0n ? ((s.available > 0n ? s.available : 0n) / -s.netFlow).toString() : null,
    observedAt: s?.observedAt ?? Math.floor(Date.now() / 1000),
  };
}

async function loadSnapshot(p: Placement, account?: Address, offset?: number): Promise<Snapshot> {
  const resolved = await resolvePlacement(p);
  const warnings: string[] = [];
  if (!resolved.board) return { apiVersion: 1, placement: p, board: null, chainId: resolved.chainId, strategy: 'rent', name: 'Community Markee', minimum: '0', maxMessageBytes: 0, maxNameBytes: 0, revnetEnabled: false, token: null, entries: [], nextOffset: null, count: 0, top: null, rankedTop: null, wallet: null, community: resolved.community, warnings, blockNumber: '0' };
  const c = await boardContext(resolved.chainId, getAddress(resolved.board), p.kind === 'gardens-community');
  const [addresses, wallet] = await Promise.all([
    offset !== undefined ? c.r<Address[]>('getMarkees', [BigInt(offset), 20n]) : c.ranked[0],
    account ? walletState(c, account) : null,
  ]);
  // Include the enforced winner and the wallet's backed message even outside this page.
  const all = [...new Set([...addresses, c.top, wallet?.backedMarkee].filter((a): a is Address => !!a && a !== zeroAddress).map(a => getAddress(a)))];
  let flags: string[] | null = null;
  let views: (number | null)[] = [];
  let metadata: Snapshot['metadata'] = null;
  try {
    const result = await snapshotReaders.presentation(c.board, all);
    flags = result.flags;
    views = result.views;
    const raw = result.metadata;
    const safeUrl = (value: unknown) => typeof value === 'string' && /^https?:\/\//.test(value) ? value : null;
    metadata = { siteUrl: safeUrl(raw?.siteUrl), logoUrl: safeUrl(raw?.logoUrl), verifiedUrls: [...(raw?.verifiedUrls || []), ...(raw?.verifiedUrl ? [raw.verifiedUrl] : [])].map(safeUrl).filter((url): url is string => url !== null) };
  } catch { warnings.push('Views and moderation are temporarily unavailable.'); }
  const entries = await Promise.all(all.map(async (addr, i): Promise<Entry> => {
    const [owner, message, name, totalFunds, aggregateRate, legacyFloor, score] = await Promise.all([
      read<Address>(c.client, addr, messageABI, 'owner', [], c.blockNumber), read<string>(c.client, addr, messageABI, 'message', [], c.blockNumber),
      read<string>(c.client, addr, messageABI, 'name', [], c.blockNumber), read<bigint>(c.client, addr, messageABI, 'totalFundsAdded', [], c.blockNumber),
      c.strategy === 'rent' ? c.r<bigint>('aggregateRate', [addr]) : 0n, c.strategy === 'rent' ? c.r<bigint>('currentLegacyFloor', [addr]) : 0n,
      c.strategy === 'rent' ? c.r<bigint>('effectiveRate', [addr]) : 0n,
    ]);
    return { address: addr, owner, message, name, score: (c.strategy === 'rent' ? score : totalFunds).toString(), totalFunds: totalFunds.toString(), aggregateRate: aggregateRate.toString(), legacyFloor: legacyFloor.toString(), moderated: flags === null ? null : flags.some(k => k.toLowerCase() === `${c.chainId}:${addr.toLowerCase()}`), views: flags === null ? null : views[i] ?? 0 };
  }));
  return { apiVersion: 1, placement: p, board: c.board, chainId: c.chainId, strategy: c.strategy, name: c.name, minimum: c.minimum.toString(), maxMessageBytes: c.maxMessageBytes, maxNameBytes: c.maxNameBytes, revnetEnabled: c.revnetEnabled, token: c.token, entries, count: c.count, nextOffset: offset === undefined ? (c.count > 20 ? 0 : null) : offset + addresses.length < c.count ? offset + addresses.length : null, top: c.top === zeroAddress ? null : c.top, rankedTop: c.ranked[0][0] || null, wallet, community: resolved.community, warnings, blockNumber: c.blockNumber.toString(), metadata };
}

export async function snapshot(p: Placement, account?: Address, offset?: number): Promise<Snapshot> {
  let result: Snapshot;
  if (displayCacheConfigured()) {
    const cached = await displayCache().read(displayKey(p, account, offset), () => loadSnapshot(p, account, offset), !!account);
    result = { ...cached.data, freshness: { updatedAt: cached.updatedAt, freshUntil: cached.freshUntil, staleUntil: cached.staleUntil, stale: cached.stale, refreshing: cached.refreshing } };
  } else {
    if (process.env.NODE_ENV === 'production') throw new SDKError('NOT_CONFIGURED', 'Snapshot storage is not configured.', 503);
    result = await loadSnapshot(p, account, offset);
  }
  // Permissions are never cached with display data. Preparation separately
  // resolves current routing; a display cache is never an authorization source.
  if (p.kind === 'gardens-community' && account) {
    const permissions = await communityPermissions(p.chainId, p.community, account);
    if (result.community) result = { ...result, community: { ...result.community, permissions } };
  }
  return result;
}
