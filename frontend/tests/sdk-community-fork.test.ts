import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPublicClient, createWalletClient, http, keccak256, toHex, parseEther, type Address, type Hex, type TypedDataDefinition } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import * as activation from '../lib/sdk/gardens/activate';
import * as claims from '../lib/sdk/gardens/claim';
import { executeAdmin } from '../lib/sdk/operations';

const url = process.env.MARKEE_SDK_FORK_RPC;
test('community authorization checks current Safe ownership, nonce replay and treasury recipient', { skip: !url, timeout: 120000 }, async () => {
  assert.match(url!, /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
  const key = keccak256(toHex('Markee SDK community local fixture only'));
  const owner = privateKeyToAccount(key);
  process.env.MARKEE_RPC_8453 = url!;
  const keeperKey = keccak256(toHex('Markee SDK keeper local fixture only'));
  const keeper = privateKeyToAccount(keeperKey);
  process.env.MARKEE_GARDENS_KEEPER_PRIVATE_KEY = keeperKey;
  process.env.MARKEE_STREAMING_LEADERBOARD_FACTORY_ADDRESS_BASE = '0x9999999999999999999999999999999999999999';
  const client = createPublicClient({ chain: base, transport: http(url!) });
  const wallet = createWalletClient({ account: owner, chain: base, transport: http(url!) });
  const rpc = async (method: string, params: unknown[]) => (await (await fetch(url!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
  assert.match(await rpc('web3_clientVersion', []), /anvil/i);
  await rpc('anvil_setBalance', [owner.address, toHex(parseEther('100'))]);
  await rpc('anvil_setBalance', [keeper.address, toHex(parseEther('100'))]);
  const out = mkdtempSync(join(tmpdir(), 'markee-sdk-fixtures-'));
  execFileSync('forge', ['build', '--root', resolve('tests/fixtures'), '--contracts', '.', '--out', out, '--cache-path', join(out, 'cache')], { stdio: 'pipe' });
  const artifact = (name: string) => JSON.parse(readFileSync(join(out, 'Community.sol', `${name}.json`), 'utf8'));
  async function deploy(name: string, args: Address[]) {
    const a = artifact(name);
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
    return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
  }
  const council = await deploy('TestCouncil', [owner.address]);
  const community = await deploy('TestCommunity', [council]);
  const router = await deploy('TestRouter', [keeper.address]);
  process.env.MARKEE_ROUTER_ADDRESS_BASE = router;
  const request = (body: unknown) => new Request('http://localhost/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  async function challenge(handler: typeof activation.POST, account: Address = owner.address) {
    const response = await handler(request({ action: 'challenge', chainId: 8453, community, account }));
    const data = await response.json(); assert.equal(response.status, 201, JSON.stringify(data)); return data;
  }
  async function sign(data: { typedData: TypedDataDefinition }) { return owner.signTypedData(data.typedData); }
  async function setOwner(address: Address) {
    const hash = await wallet.writeContract({ abi: artifact('TestCouncil').abi, address: council, functionName: 'setOwner', args: [address] });
    await client.waitForTransactionReceipt({ hash });
  }
  const unauthorized = await activation.POST(request({ action: 'challenge', chainId: 8453, community, account: '0x2222222222222222222222222222222222222222' }));
  assert.equal(unauthorized.status, 403);
  const revoked = await challenge(activation.POST);
  await setOwner('0x2222222222222222222222222222222222222222');
  const revokedResult = await activation.POST(request({ action: 'verify', nonce: revoked.nonce, signature: await sign(revoked) }));
  assert.equal(revokedResult.status, 403);
  await setOwner(owner.address);
  const valid = await challenge(activation.POST);
  const body = { action: 'verify', nonce: valid.nonce, signature: await sign(valid) };
  const execution = await (await executeAdmin('activate', request(body), body, activation.POST)).json();
  assert.equal(execution.status, 'complete', JSON.stringify(execution));
  await executeAdmin('activate', request(body), body, activation.POST);
  assert.equal(await client.readContract({ abi: artifact('TestRouter').abi, address: router, functionName: 'creations' }), 1n);
  const replay = await activation.POST(request(body)); assert.equal(replay.status, 401);
  const integrationKey = keccak256((await import('viem')).encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [8453n, community]));
  const vault = await client.readContract({ abi: artifact('TestRouter').abi, address: router, functionName: 'communityVault', args: [integrationKey] }) as Address;
  await client.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: vault, value: parseEther('0.1') }) });
  const claim = await challenge(claims.POST, council);
  assert.equal(claim.typedData.message.recipient.toLowerCase(), council.toLowerCase());
  assert.ok(BigInt(claim.typedData.message.claimAmount) > 0n);
  assert.ok(BigInt(claim.typedData.message.gasCost) > 0n);
  const before = await client.getBalance({ address: council });
  const claimBody = { action: 'verify', nonce: claim.nonce, signature: await sign(claim) };
  const claimed = await (await executeAdmin('claim', request(claimBody), claimBody, claims.POST)).json();
  assert.equal(claimed.status, 'complete', JSON.stringify(claimed));
  assert.ok(await client.getBalance({ address: council }) > before);
  await executeAdmin('claim', request(claimBody), claimBody, claims.POST);
  assert.equal(await client.readContract({ abi: artifact('TestRouter').abi, address: router, functionName: 'sweeps' }), 1n);
});
