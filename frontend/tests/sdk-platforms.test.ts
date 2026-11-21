import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256, stringToHex } from 'viem';
import { placement } from '../lib/sdk/validation';
import { givethProjectPrototype, platformAdapter, platformCommunity, platformEnabled, platformKey, platformTag } from '../lib/sdk/platforms';
import { markeeAdapter } from '../lib/sdk/gardens/revenue';
import { platformActivate } from '../lib/sdk/platform-activate';
import { getEnvPublicClient } from '../lib/sdk/chains';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/sdk/v1/[...path]/route';
import { executeAdmin } from '../lib/sdk/operations';
import { givethProject, resolveGivethSlug } from '../lib/sdk/giveth-project';

const owner = '0x1111111111111111111111111111111111111111' as const;
const nextOwner = '0x2222222222222222222222222222222222222222' as const;
const wallet = '0x3333333333333333333333333333333333333333' as const;
const nextWallet = '0x4444444444444444444444444444444444444444' as const;

test('generic placement is canonical and keeps old placement shapes', () => {
  const generic = placement({ kind: 'platform-community', platformId: 'revnet', chainId: 8453, communityId: '007' });
  assert.equal(generic.kind, 'platform-community');
  if (generic.kind !== 'platform-community') return;
  assert.equal(generic.communityId, '7');
  assert.match(platformKey(generic), /^0x[\da-f]{64}$/);
  assert.notEqual(platformKey(generic), keccak256(stringToHex('7')));
  assert.equal(placement({ kind: 'gardens-community', chainId: 100, community: owner }).kind, 'gardens-community');
  assert.equal(placement({ kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '7' }).kind, 'platform-community');
  assert.throws(() => placement({ kind: 'platform-community', platformId: 'giveth', chainId: 100, communityId: '7' }));
  assert.throws(() => placement({ kind: 'platform-community', platformId: 'unknown', chainId: 8453, communityId: '7' }));
  assert.throws(() => placement({ kind: 'platform-community', platformId: 'revnet', chainId: 8453, communityId: '-1' }));
  assert.throws(() => placement({ kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '9007199254740992' }));
});

test('platform rollout gates require explicit server configuration', () => {
  const gardens = { kind: 'platform-community' as const, platformId: 'gardens', chainId: 100, communityId: owner };
  const giveth = { kind: 'platform-community' as const, platformId: 'giveth', chainId: 8453, communityId: '42' };
  const oldGardens = process.env.MARKEE_PLATFORM_GARDENS_ENABLED;
  const oldRevnet = process.env.MARKEE_PLATFORM_REVNET_ENABLED;
  const oldGiveth = process.env.MARKEE_PLATFORM_GIVETH_ENABLED;
  try {
    delete process.env.MARKEE_PLATFORM_GARDENS_ENABLED;
    delete process.env.MARKEE_PLATFORM_REVNET_ENABLED;
    delete process.env.MARKEE_PLATFORM_GIVETH_ENABLED;
    assert.equal(platformEnabled(gardens), false);
    assert.equal(platformEnabled(revnetPlacement), false);
    assert.equal(platformEnabled(giveth), false);
    process.env.MARKEE_PLATFORM_GIVETH_ENABLED = 'true';
    assert.equal(platformEnabled(giveth), true);
    assert.equal(platformEnabled(gardens), false);
    process.env.MARKEE_PLATFORM_GARDENS_ENABLED = 'true';
    assert.equal(platformEnabled(gardens), true);
    assert.equal(platformEnabled(giveth), true);
  } finally {
    if (oldGardens === undefined) delete process.env.MARKEE_PLATFORM_GARDENS_ENABLED; else process.env.MARKEE_PLATFORM_GARDENS_ENABLED = oldGardens;
    if (oldRevnet === undefined) delete process.env.MARKEE_PLATFORM_REVNET_ENABLED; else process.env.MARKEE_PLATFORM_REVNET_ENABLED = oldRevnet;
    if (oldGiveth === undefined) delete process.env.MARKEE_PLATFORM_GIVETH_ENABLED; else process.env.MARKEE_PLATFORM_GIVETH_ENABLED = oldGiveth;
  }
});

test('live Giveth adapter checks current admin and Base recipient without trusting a cached owner', async t => {
  let active = true;
  let currentOwner: string = owner;
  let recipient: string = wallet;
  t.mock.method(globalThis, 'fetch', async (_url: string, request: RequestInit) => {
    assert.equal(String(_url), 'https://core.v6.giveth.io/graphql');
    const body = JSON.parse(String(request.body));
    if (body.query.includes('MarkeeGivethAdmin')) {
      assert.deepEqual(body.variables, { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2' });
      return Response.json({ data: { user: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2', wallets: [{ address: currentOwner, chainType: 'EVM', isPrimary: true }] } } });
    }
    assert.deepEqual(body.variables, { id: 42 });
    return Response.json({ data: { project: { id: '42', status: active ? 'ACTIVE' : 'DEACTIVATED',
      adminUser: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2' }, addresses: [{ networkId: 8453, chainType: 'EVM', address: recipient, isRecipient: true }] } } });
  });
  const project = placement({ kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '42' });
  if (project.kind !== 'platform-community') return;
  const adapter = platformAdapter(project);
  assert.deepEqual(await adapter.authority(project, owner), { authorized: true, recipient: wallet });
  currentOwner = nextOwner;
  recipient = nextWallet;
  assert.deepEqual(await adapter.authority(project, owner), { authorized: false, recipient: nextWallet });
  assert.deepEqual(await adapter.authority(project, nextOwner), { authorized: true, recipient: nextWallet });
  active = false;
  await assert.rejects(adapter.authority(project, nextOwner), /not active or available/);
  await assert.rejects(givethProject('9007199254740992'), /Invalid Giveth Project ID/);
});

test('Giveth owner lookup fails closed on missing owner, mismatched ID and upstream outage', async t => {
  let result: unknown = { data: { project: { id: '7', status: 'ACTIVE', adminUser: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2' } } } };
  t.mock.method(globalThis, 'fetch', async (_url: string, request: RequestInit) => Response.json(JSON.parse(String(request.body)).query.includes('MarkeeGivethAdmin')
    ? { data: { user: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2', wallets: [] } } } : result));
  await assert.rejects(givethProject('42'), /not active or available/);
  result = { data: { project: { id: '42', status: 'ACTIVE', adminUser: null } } };
  await assert.rejects(givethProject('42'), /owner is unavailable/);
  result = { data: { project: { id: '42', status: 'ACTIVE', adminUser: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2' } } } };
  await assert.rejects(givethProject('42'), /owner wallet is unavailable or ambiguous/);
  result = { errors: [{ message: 'Provider error' }] };
  await assert.rejects(givethProject('42'), /not active or available/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw Error('offline'); });
  await assert.rejects(givethProject('42'), /lookup is unavailable/);
});

test('Giveth beneficiary is optional, but ambiguous or invalid Base recipients fail closed', async t => {
  let addresses: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, request: RequestInit) => Response.json(JSON.parse(String(request.body)).query.includes('MarkeeGivethAdmin')
    ? { data: { user: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2', wallets: [{ address: owner, chainType: 'EVM', isPrimary: true }] } } }
    : { data: { project: { id: '42', status: 'ACTIVE', adminUser: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2' }, addresses } } }));
  assert.deepEqual(await givethProject('42'), { owner, baseRecipient: null });
  addresses = [{ networkId: 8453, chainType: 'EVM', address: wallet, isRecipient: true }];
  assert.deepEqual(await givethProject('42'), { owner, baseRecipient: wallet });
  addresses = [...addresses, { networkId: 8453, chainType: 'EVM', address: nextWallet, isRecipient: true }];
  await assert.rejects(givethProject('42'), /Base recipient is ambiguous/);
  addresses = [{ networkId: 8453, chainType: 'EVM', address: empty, isRecipient: true }];
  await assert.rejects(givethProject('42'), /Base recipient is ambiguous/);
});

test('Giveth slug resolves to a verified numeric project identity through the v1 API', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ data: { projectBySlug: { id: '42', title: 'Gardens', status: 'ACTIVE' } } }); });
  assert.deepEqual(await resolveGivethSlug('gardens'), { id: '42', title: 'Gardens' });
  assert.equal(calls, 1);
  await assert.rejects(resolveGivethSlug('../gardens'), /Invalid Giveth project slug/);
  assert.equal(calls, 1);
  calls = 0;
  const response = await GET(new NextRequest('http://localhost/api/sdk/v1/platform/giveth/resolve?slug=gardens'), { params: Promise.resolve({ path: ['platform', 'giveth', 'resolve'] }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: '42', title: 'Gardens' });
});

test('Giveth activation challenge uses the live project admin and rejects owner changes', async t => {
  await withPlatformEnv(async () => {
    const previous = process.env.MARKEE_PLATFORM_GIVETH_ENABLED;
    process.env.MARKEE_PLATFORM_GIVETH_ENABLED = 'true';
    try {
      let currentOwner: string = owner;
      t.mock.method(globalThis, 'fetch', async (_url: string, request: RequestInit) => Response.json(JSON.parse(String(request.body)).query.includes('MarkeeGivethAdmin')
        ? { data: { user: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2', wallets: [{ address: currentOwner, chainType: 'EVM', isPrimary: true }] } } }
        : { data: { project: { id: '42', status: 'ACTIVE', adminUser: { id: '06e95c03-8059-4c38-a86d-b4ce794cb7a2' }, addresses: [] } } }));
      const client = getEnvPublicClient(8453);
      t.mock.method(client, 'readContract', async ({ functionName }: { functionName: string }) => {
        if (functionName === 'integrations') return [empty, empty, 0, empty, empty];
        if (functionName === 'operators') return true;
        if (functionName === 'saleFactory' || functionName === 'rentFactory') return factory;
        throw Error(`Unexpected read ${functionName}`);
      });
      const project = { kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '42' } as const;
      const request = (account: string) => ({ action: 'challenge', placement: project, strategy: 'sale', beneficiary: wallet, account });
      await assert.rejects(platformActivate(request(nextOwner)), /cannot activate/);
      const challenge = await platformActivate(request(owner));
      assert.equal((challenge.typedData as { message: { communityKey: string } }).message.communityKey, platformKey(project));
      currentOwner = nextOwner;
      await assert.rejects(platformActivate({ action: 'verify', nonce: challenge.nonce, signature: '0x123456' }), /permissions changed/);
    } finally {
      if (previous === undefined) delete process.env.MARKEE_PLATFORM_GIVETH_ENABLED;
      else process.env.MARKEE_PLATFORM_GIVETH_ENABLED = previous;
    }
  });
});

test('Giveth prototype reads current owner and Base recipient, and fails closed on outage', async () => {
  let data: { active: boolean; owner: typeof owner | typeof nextOwner; baseRecipient: typeof wallet | typeof nextWallet } | null = { active: true, owner, baseRecipient: wallet };
  const adapter = givethProjectPrototype(async id => { assert.equal(id, '42'); return data; });
  const project = { kind: 'platform-community', platformId: 'giveth', chainId: 8453, communityId: '42' } as const;
  assert.equal(adapter.communityId(project), `0x${(42n).toString(16).padStart(64, '0')}`);
  assert.deepEqual(await adapter.authority(project, owner), { authorized: true, recipient: wallet });
  data = { active: true, owner: nextOwner, baseRecipient: nextWallet };
  assert.deepEqual(await adapter.authority(project, owner), { authorized: false, recipient: nextWallet });
  assert.deepEqual(await adapter.authority(project, nextOwner), { authorized: true, recipient: nextWallet });
  assert.equal(await adapter.recipient(project), nextWallet);
  data = null;
  await assert.rejects(adapter.authority(project, nextOwner), /unavailable/);
});

const revnetPlacement = { kind: 'platform-community', platformId: 'revnet', chainId: 8453, communityId: '42' } as const;
const registrar = '0x5555555555555555555555555555555555555555' as const;
const board = '0x6666666666666666666666666666666666666666' as const;
const factory = '0x7777777777777777777777777777777777777777' as const;
const empty = '0x0000000000000000000000000000000000000000' as const;
async function withPlatformEnv(run: () => Promise<void>) {
  const names = ['MARKEE_PLATFORM_REVNET_ENABLED', 'MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE',
    'MARKEE_REVNET_V6_PROJECTS_8453', 'MARKEE_REVNET_V6_PERMISSIONS_8453', 'MARKEE_REVNET_V6_DIRECTORY_8453',
    'MARKEE_REVNET_V6_ADMIN_PERMISSION_ID', 'MARKEE_GENERIC_OPERATOR_PRIVATE_KEY_BASE'];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    MARKEE_PLATFORM_REVNET_ENABLED: 'true', MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE: registrar,
    MARKEE_REVNET_V6_PROJECTS_8453: factory, MARKEE_REVNET_V6_PERMISSIONS_8453: factory,
    MARKEE_REVNET_V6_DIRECTORY_8453: factory, MARKEE_REVNET_V6_ADMIN_PERMISSION_ID: '1',
    MARKEE_GENERIC_OPERATOR_PRIVATE_KEY_BASE: `0x${'01'.repeat(32)}`,
  });
  try { await run(); }
  finally { for (const name of names) if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; }
}

test('platform API reads registrar state, authorization and pending admin without a display cache', async t => {
  await withPlatformEnv(async () => {
    const client = getEnvPublicClient(8453);
    let integration: readonly [string, string, number, string, string] = [empty, empty, 0, empty, empty];
    let currentAdmin: string = registrar;
    t.mock.method(client, 'readContract', async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'integrations': return integration;
        case 'admin': return currentAdmin;
        case 'beneficiaryAddress': return wallet;
        case 'ownerOf': return owner;
        case 'hasPermission': return false;
        case 'primaryTerminalOf': return wallet;
        case 'operators': return true;
        case 'saleFactory': case 'rentFactory': return factory;
        default: throw Error(`Unexpected read ${functionName}`);
      }
    });
    const available = await platformCommunity(revnetPlacement, owner);
    assert.equal(available.integration.status, 'not_integrated');
    assert.equal(available.permissions?.canActivate, true);
    assert.equal((await platformCommunity(revnetPlacement, nextOwner)).permissions?.canActivate, false);
    integration = [board, wallet, 1, owner, wallet];
    assert.equal((await platformCommunity(revnetPlacement, owner)).integration.status, 'pending_admin');
    currentAdmin = owner;
    const active = await platformCommunity(revnetPlacement, owner);
    assert.equal(active.integration.status, 'active');
    assert.equal(active.platform?.beneficiary, wallet);
    assert.equal(active.permissions?.canActivate, false);
  });
});

test('platform activation challenge rejects unauthorized and duplicate boards; disabled APIs fail closed', async t => {
  await withPlatformEnv(async () => {
    const client = getEnvPublicClient(8453);
    let integration: readonly [string, string, number, string, string] = [empty, empty, 0, empty, empty];
    let currentOwner: string = owner;
    t.mock.method(client, 'readContract', async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'integrations': return integration;
        case 'ownerOf': return currentOwner;
        case 'hasPermission': return false;
        case 'primaryTerminalOf': return wallet;
        case 'operators': return true;
        case 'saleFactory': case 'rentFactory': return factory;
        case 'admin': return owner;
        case 'beneficiaryAddress': return wallet;
        default: throw Error(`Unexpected read ${functionName}`);
      }
    });
    const request = (account: string) => ({ action: 'challenge', placement: revnetPlacement, strategy: 'sale', beneficiary: wallet, account });
    await assert.rejects(platformActivate(request(nextOwner)), /cannot activate/);
    const challenge = await platformActivate(request(owner));
    const typed = challenge.typedData as { domain: { version: string; verifyingContract: string }; message: { beneficiary: string; activator: string; strategy: number; factory: string; identityChainId: string; communityKey: string } };
    assert.equal(typed.domain.version, '2');
    assert.equal(typed.domain.verifyingContract, registrar);
    assert.equal(typed.message.beneficiary, wallet);
    assert.equal(typed.message.activator, owner);
    assert.equal(typed.message.strategy, 1);
    assert.equal(typed.message.factory, factory);
    assert.equal(typed.message.identityChainId, '8453');
    assert.equal(typed.message.communityKey, platformKey(revnetPlacement));
    currentOwner = nextOwner;
    await assert.rejects(platformActivate({ action: 'verify', nonce: challenge.nonce, signature: '0x123456' }), /permissions changed/);
    currentOwner = owner;
    integration = [board, wallet, 1, owner, wallet];
    await assert.rejects(platformActivate(request(owner)), /already has/);
    process.env.MARKEE_PLATFORM_REVNET_ENABLED = 'false';
    await assert.rejects(platformActivate(request(owner)), /not enabled/);
    assert.equal((await platformCommunity(revnetPlacement, owner)).integration.status, 'active', 'disabled platform can still display existing board');
  });
});

test('v1 HTTP boundary rejects unknown platforms and does not offer gated activation', async () => {
  const invalid = await GET(new NextRequest(`http://localhost/api/sdk/v1/snapshot?placement=${encodeURIComponent(JSON.stringify({ ...revnetPlacement, platformId: 'unknown' }))}`), { params: Promise.resolve({ path: ['snapshot'] }) });
  assert.equal(invalid.status, 400);
  const activated = await POST(new NextRequest('http://localhost/api/sdk/v1/platform/activate-direct', {
    method: 'POST', body: JSON.stringify({ action: 'challenge', placement: revnetPlacement, strategy: 'sale', beneficiary: wallet, account: owner }),
  }), { params: Promise.resolve({ path: ['platform', 'activate-direct'] }) });
  assert.equal(activated.status, 503);
  assert.equal((await activated.json()).code, 'PLATFORM_DISABLED');
  const badBeneficiary = await POST(new NextRequest('http://localhost/api/sdk/v1/platform/activate-direct', {
    method: 'POST', body: JSON.stringify({ action: 'challenge', placement: revnetPlacement, strategy: 'sale', beneficiary: empty, account: owner }),
  }), { params: Promise.resolve({ path: ['platform', 'activate-direct'] }) });
  assert.equal(badBeneficiary.status, 400);
  assert.equal((await badBeneficiary.json()).code, 'INVALID_ADDRESS');
  const former = await POST(new NextRequest('http://localhost/api/sdk/v1/platform/activate', { method: 'POST', body: '{}' }), { params: Promise.resolve({ path: ['platform', 'activate'] }) });
  assert.equal(former.status, 426);
  assert.equal((await former.json()).code, 'PLATFORM_UPGRADE_REQUIRED');
});

test('old preview activation retains status recovery for a previously recorded operation', async () => {
  const body = { action: 'verify', nonce: '987654321', signature: '0x123456' };
  const previous = await executeAdmin('platform/activate', new Request('http://localhost/previous'), body,
    async () => Response.json({ transactionHash: `0x${'b'.repeat(64)}`, markeeChainId: 8453 }));
  const saved = await previous.json();
  const response = await POST(new NextRequest('http://localhost/api/sdk/v1/platform/activate', {
    method: 'POST', body: JSON.stringify(body),
  }), { params: Promise.resolve({ path: ['platform', 'activate'] }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, saved.id);
});

test('disabled unactivated community remains a readable v1 snapshot', async () => {
  const previous = process.env.MARKEE_PLATFORM_REVNET_ENABLED;
  const oldRegistrar = process.env.MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE;
  process.env.MARKEE_PLATFORM_REVNET_ENABLED = 'false';
  delete process.env.MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE;
  try {
    const url = `http://localhost/api/sdk/v1/snapshot?${new URLSearchParams({ placement: JSON.stringify(revnetPlacement) })}`;
    const response = await GET(new NextRequest(url), { params: Promise.resolve({ path: ['snapshot'] }) });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.equal(snapshot.board, null);
    assert.equal(snapshot.community.integration.status, 'disabled');
    assert.equal(snapshot.community.platform.enabled, false);
  } finally {
    if (previous === undefined) delete process.env.MARKEE_PLATFORM_REVNET_ENABLED; else process.env.MARKEE_PLATFORM_REVNET_ENABLED = previous;
    if (oldRegistrar === undefined) delete process.env.MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE; else process.env.MARKEE_PLATFORM_BOARD_REGISTRAR_ADDRESS_BASE = oldRegistrar;
  }
});

test('admin-acceptance status binds transaction sender, board and calldata before confirming', async t => {
  await withPlatformEnv(async () => {
    const client = getEnvPublicClient(8453);
    let admin: string = registrar;
    let input = '0x0e18b681';
    let sender: string = owner;
    let recipient: string = board;
    let receiptStatus: string = 'success';
    t.mock.method(client, 'readContract', async ({ functionName }: { functionName: string }) => {
      if (functionName === 'integrations') return [board, wallet, 1, owner, wallet];
      if (functionName === 'admin') return admin;
      if (functionName === 'beneficiaryAddress') return wallet;
      throw Error(`Unexpected read ${functionName}`);
    });
    t.mock.method(client, 'getTransaction', async () => ({ from: sender, to: recipient, input }));
    t.mock.method(client, 'getTransactionReceipt', async () => ({ status: receiptStatus }));
    const transactionHash = `0x${'a'.repeat(64)}`;
    const url = `http://localhost/api/sdk/v1/platform/admin-status?${new URLSearchParams({ placement: JSON.stringify(revnetPlacement), account: owner, transactionHash })}`;
    const call = () => GET(new NextRequest(url), { params: Promise.resolve({ path: ['platform', 'admin-status'] }) });
    assert.equal((await (await call()).json()).status, 'pending', 'receipt alone does not complete admin handoff');
    admin = owner;
    assert.equal((await (await call()).json()).status, 'confirmed');
    input = '0x12345678';
    const mismatch = await call();
    assert.equal(mismatch.status, 409);
    assert.equal((await mismatch.json()).code, 'TRANSACTION_MISMATCH');
    input = '0x0e18b681';
    sender = nextOwner;
    assert.equal((await call()).status, 409, 'a different signer cannot claim admin acceptance');
    sender = owner;
    recipient = wallet;
    assert.equal((await call()).status, 409, 'a transaction to another contract cannot claim admin acceptance');
    recipient = board;
    receiptStatus = 'reverted';
    assert.equal((await (await call()).json()).status, 'reverted');
  });
});

test('registrar lookup outage fails closed rather than reporting an unactivated board', async t => {
  await withPlatformEnv(async () => {
    t.mock.method(getEnvPublicClient(8453), 'readContract', async () => { throw Error('RPC unavailable'); });
    await assert.rejects(platformCommunity(revnetPlacement, owner), /RPC unavailable/);
    const url = `http://localhost/api/sdk/v1/snapshot?${new URLSearchParams({ placement: JSON.stringify(revnetPlacement) })}`;
    const response = await GET(new NextRequest(url), { params: Promise.resolve({ path: ['snapshot'] }) });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'REQUEST_FAILED');
  });
});

test('factory platform tags fit the 31-byte rent factory limit', () => {
  const gardens = { kind: 'platform-community' as const, platformId: 'gardens', chainId: 100, communityId: '0xE2396fe2169ca026962971d3B2E373Ba925B6257' };
  assert.equal(platformTag(gardens), '0xe2396fe2169ca026962971d3b2e37');
  assert.ok(new TextEncoder().encode(platformTag(gardens)).length <= 31);
  assert.equal(platformTag(revnetPlacement), '42');
});

test('Gardens activation requires the council Safe itself and no existing gardens-community board', async t => {
  const council = nextWallet;
  const community = '0xE2396fe2169ca026962971d3B2E373Ba925B6257';
  const gardensPlacement = { kind: 'platform-community', platformId: 'gardens', chainId: 8453, communityId: community } as const;
  const names = ['MARKEE_PLATFORM_GARDENS_ENABLED', 'MARKEE_GARDENS_REGISTRY_FACTORY_8453'];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { MARKEE_PLATFORM_GARDENS_ENABLED: 'true', MARKEE_GARDENS_REGISTRY_FACTORY_8453: factory });
  try {
    await withPlatformEnv(async () => {
      t.mock.method(getEnvPublicClient(8453), 'readContract', async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case 'getCommunityValidity': return true;
          case 'councilSafe': return council;
          case 'isOwner': return true;
          case 'integrations': return [empty, empty, 0, empty, empty];
          case 'operators': return true;
          case 'saleFactory': case 'rentFactory': return factory;
          default: throw Error(`Unexpected read ${functionName}`);
        }
      });
      let legacyBoard: string | null = null;
      t.mock.method(markeeAdapter, 'getCommunityIntegration', async () => ({ integration: { leaderboardAddress: legacyBoard, vaultAddress: null, status: legacyBoard ? 'active' : 'not_integrated' } }));
      const adapter = platformAdapter(gardensPlacement);
      assert.deepEqual(await adapter.authority(gardensPlacement, owner), { authorized: false, recipient: council }, 'a single Safe owner cannot activate');
      assert.deepEqual(await adapter.authority(gardensPlacement, council), { authorized: true, recipient: council });
      const request = (account: string) => ({ action: 'challenge', placement: gardensPlacement, strategy: 'rent', beneficiary: wallet, account });
      await assert.rejects(platformActivate(request(owner)), /cannot activate/);
      const challenge = await platformActivate(request(council));
      assert.equal((challenge.typedData as { message: { activator: string } }).message.activator, council);
      legacyBoard = board;
      await assert.rejects(platformActivate(request(council)), /already has/);
    });
  } finally {
    for (const name of names) if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name];
  }
});
