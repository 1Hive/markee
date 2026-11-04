import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The upstream URL is never printed or passed on Anvil's command line. Only
// method counts and response status are recorded; no payloads or credentials.
export function createRpcProxy(upstream, { limit = 4, report = () => {} } = {}) {
  const counts = {};
  let active = 0;
  const waiting = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) { response.writeHead(413).end(); return; }
    }
    if (waiting.length >= 1000) { response.writeHead(503).end(); return; }
    if (active >= limit) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try {
      const calls = JSON.parse(body);
      for (const call of Array.isArray(calls) ? calls : [calls]) {
        const method = typeof call.method === 'string' && /^[a-zA-Z0-9_]+$/.test(call.method) ? call.method : 'unknown';
        counts[method] = (counts[method] || 0) + 1;
      }
      const result = await fetch(upstream, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(120000) });
      counts[`http_${result.status}`] = (counts[`http_${result.status}`] || 0) + 1;
      response.writeHead(result.status, { 'Content-Type': 'application/json' }).end(await result.text());
    } catch {
      counts.failures = (counts.failures || 0) + 1;
      response.writeHead(502).end(JSON.stringify({ error: 'Fork upstream request failed' }));
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
      report({ ...counts });
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.E2E_FORK_RPC_URL) throw new Error('E2E_FORK_RPC_URL is required');
  mkdirSync('test-results', { recursive: true });
  let stats = {};
  const report = () => {
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/fork-rpc-counts.json', JSON.stringify(stats, null, 2));
    console.log('[fork upstream RPC counts]', JSON.stringify(stats));
  };
  const server = createRpcProxy(process.env.E2E_FORK_RPC_URL, { report: counts => { stats = counts; } });
  await new Promise(resolve => server.listen(8546, '127.0.0.1', resolve));
  // Identifies a freshly launched, clean fork so setup need not call anvil_reset,
  // which discards the storage cache loaded from disk.
  writeFileSync('tests/e2e/fork/.anvil-instance', randomUUID());
  const child = spawn('anvil', ['--fork-url', 'http://127.0.0.1:8546', '--fork-block-number', process.env.E2E_FORK_BLOCK || '52820000',
    '--mnemonic', process.env.E2E_MNEMONIC, '--port', '8545', '--silent'], { stdio: 'inherit', detached: true });
  const timer = setInterval(report, 30000);
  // SIGTERM would terminate Anvil without flushing its storage cache.
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; child.kill('SIGINT'); report(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  child.on('error', () => { console.error('Could not start Anvil'); process.exit(1); });
  child.on('exit', code => { clearInterval(timer); report(); server.close(); process.exit(code || 0); });
}
