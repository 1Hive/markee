import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readdir, stat, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRpcProxy } from './e2e/fork/server.mjs';

const available = spawnSync('anvil', ['--version']).status === 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function rpc(url, method, params = []) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(5000) });
  const body = await r.json(); if (body.error) throw new Error(body.error.message); return body.result;
}
async function start(args, t) {
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  const child = spawn('anvil', ['--port', String(port), '--silent', ...args], { stdio: 'ignore' });
  const stopped = new Promise(resolve => child.once('exit', resolve));
  let done = false;
  const stop = async () => {
    if (done) return; done = true; child.kill('SIGINT');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000); await stopped; clearTimeout(timeout);
  };
  t.after(stop);
  for (let i = 0; i < 100; i++) {
    try { await rpc(url, 'eth_chainId'); return { url, stop }; } catch { await sleep(50); }
  }
  throw new Error('Local Anvil did not start');
}
async function files(path) {
  return (await Promise.all((await readdir(path, { withFileTypes: true })).map(async entry => entry.isDirectory() ? files(join(path, entry.name)) : [{ path: join(path, entry.name), size: (await stat(join(path, entry.name))).size }]))).flat();
}

test('Anvil persists useful storage cache across processes at the pinned block (no external RPC)', { skip: !available, timeout: 30000 }, async t => {
  const chain = String(1000000000 + Math.floor(Math.random() * 1000000000));
  const cache = join(homedir(), '.foundry/cache/rpc', chain); t.after(() => rm(cache, { recursive: true, force: true }));
  const source = await start(['--chain-id', chain], t);
  const address = '0x1111111111111111111111111111111111111111';
  await rpc(source.url, 'anvil_setCode', [address, '0x60006000f3']);
  for (let i = 0; i < 64; i++) await rpc(source.url, 'anvil_setStorageAt', [address, `0x${i.toString(16).padStart(64, '0')}`, `0x${(i + 1).toString(16).padStart(64, '0')}`]);
  await rpc(source.url, 'evm_mine');
  const block = await rpc(source.url, 'eth_blockNumber');
  let counts = {};
  const proxy = createRpcProxy(source.url, { report: s => { counts = s; } });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => { proxy.closeAllConnections(); proxy.close(); });
  const forkUrl = `http://127.0.0.1:${proxy.address().port}`;
  const run = async () => {
    const fork = await start(['--fork-url', forkUrl, '--fork-block-number', String(Number(block))], t);
    // Fresh forks must not be reset: reset discards restored storage.

    for (let i = 0; i < 64; i++) assert.equal(BigInt(await rpc(fork.url, 'eth_getStorageAt', [address, `0x${i.toString(16)}`, 'latest'])), BigInt(i + 1));
    await fork.stop();
  };
  await run(); const cold = counts.eth_getStorageAt || 0;
  const entries = await files(cache);
  assert.ok(entries.some(entry => entry.size > 4096), 'Cache must contain actual storage, not only metadata');
  await run(); const warm = (counts.eth_getStorageAt || 0) - cold;
  assert.ok(cold >= 64); assert.ok(warm < cold / 2, `cold ${cold}, warm ${warm}`);
  console.log(`Local fork upstream storage reads: cold=${cold}, warm=${warm}`);
});
