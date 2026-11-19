import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installRpcLogging, rpcLogLine, rpcMethods } from '../lib/server/rpcLogging'

const KEYED_URL = 'https://base-mainnet.g.alchemy.com/v2/SECRETKEY123'

test('reads methods from single and batched JSON-RPC bodies', () => {
  assert.deepEqual(rpcMethods(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })), ['eth_blockNumber'])
  assert.deepEqual(rpcMethods(JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0xcA11bde05977b3631167028862bE2a173976CA11', data: '0x' }, 'latest'] },
    { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: '0x0000000000000000000000000000000000000001', data: '0x' }, 'latest'] },
  ])), ['eth_call(multicall)', 'eth_call'])
})

test('ignores bodies that are not JSON-RPC', () => {
  assert.equal(rpcMethods(undefined), null)
  assert.equal(rpcMethods('{"query":"{ markees { id } }"}'), null)
  assert.equal(rpcMethods('not json "jsonrpc"'), null)
})

test('logs the host and method counts but never the keyed path', () => {
  const line = rpcLogLine(KEYED_URL, ['eth_call', 'eth_call', 'eth_blockNumber'])
  assert.equal(line, '[rpc] base-mainnet.g.alchemy.com eth_callx2 eth_blockNumber')
  assert.ok(!line.includes('SECRETKEY123'))
})

test('wraps fetch once, logs RPC requests only, and passes every request through', async () => {
  const calls: unknown[] = []
  const lines: string[] = []
  const target = { fetch: (async (input: unknown) => { calls.push(input); return new Response('{}') }) as typeof fetch }
  installRpcLogging(target, line => lines.push(line))
  installRpcLogging(target, line => lines.push(line))
  await target.fetch(KEYED_URL, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }) })
  await target.fetch('https://api.github.com/repos/x/y', { method: 'GET' })
  assert.equal(calls.length, 2)
  assert.deepEqual(lines, ['[rpc] base-mainnet.g.alchemy.com eth_chainId'])
})
