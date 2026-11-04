import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRpcProxy } from './e2e/fork/server.mjs';

test('fork proxy bounds upstream concurrency, preserves RPC responses and records methods only', async t => {
  let active = 0, peak = 0, stats;
  const upstream = createServer(async (req, res) => {
    active++; peak = Math.max(peak, active);
    let body = ''; for await (const chunk of req) body += chunk;
    const call = JSON.parse(body);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result: '0x42' }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = createRpcProxy(`http://127.0.0.1:${upstream.address().port}/secret-key`, { limit: 2, report: s => { stats = s; } });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => { proxy.closeAllConnections(); proxy.close(); upstream.closeAllConnections(); upstream.close(); });
  const url = `http://127.0.0.1:${proxy.address().port}`;
  const results = await Promise.all(Array.from({ length: 10 }, (_, id) => fetch(url, { method: 'POST', body: JSON.stringify({ id, method: 'eth_getStorageAt', params: ['private-payload'] }) }).then(r => r.json())));
  assert.ok(peak <= 2); assert.deepEqual(results.map(r => r.id), Array.from({ length: 10 }, (_, i) => i));
  assert.equal(stats.eth_getStorageAt, 10); assert.equal(stats.http_200, 10);
  assert.doesNotMatch(JSON.stringify(stats), /private-payload|secret-key/);
  assert.equal((await fetch(url)).status, 405);
});
