import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicClient, custom, encodeFunctionResult, multicall3Abi, parseAbi } from 'viem'
import { base } from 'viem/chains'
import { FAILED_RETRY_MS, RESYNC_AFTER_MS, isMissingFunction, isPermanentGitHubStatus, shouldBackOff, syncDecision, syncFailedKey, type SyncFileResult } from '../lib/github/syncSchedule'

const now = 1_800_000_000_000

test('syncs a board with no history', () => {
  assert.equal(syncDecision('a', null, null, now), 'sync')
})

test('skips a board already synced with the same billboard today', () => {
  assert.equal(syncDecision('a', { signature: 'a', at: now - 60_000 }, null, now), 'unchanged')
})

test('resyncs the same billboard once a day', () => {
  assert.equal(syncDecision('a', { signature: 'a', at: now - RESYNC_AFTER_MS }, null, now), 'sync')
})

test('backs off a board whose same billboard failed recently', () => {
  assert.equal(syncDecision('a', null, { signature: 'a', at: now - 10 * 60_000 }, now), 'backoff')
})

test('retries a failed board once the backoff passes', () => {
  assert.equal(syncDecision('a', null, { signature: 'a', at: now - FAILED_RETRY_MS }, now), 'sync')
})

test('retries a failed board at once when its billboard changes', () => {
  assert.equal(syncDecision('b', null, { signature: 'a', at: now - 60_000 }, now), 'sync')
})

// ─── Which failures back off ────────────────────────────────────────────────


const file = (over: Partial<SyncFileResult>): SyncFileResult => ({ repoFullName: 'o/r', filePath: 'README.md', success: false, ...over })

test('backs off only when every failed file failed for a lasting reason', () => {
  assert.equal(shouldBackOff([file({ permanent: true, error: 'Address-specific delimiters not found in file' })]), true)
  assert.equal(shouldBackOff([file({ permanent: true }), file({ permanent: false, error: 'Write failed (502)' })]), false)
  assert.equal(shouldBackOff([file({ error: 'Sync failed' })]), false)
  assert.equal(shouldBackOff([]), false)
})

test('treats 401 and 404 as lasting GitHub failures and everything else as temporary', () => {
  for (const status of [401, 404]) assert.equal(isPermanentGitHubStatus(status), true)
  for (const status of [403, 409, 422, 429, 500, 502, 503]) assert.equal(isPermanentGitHubStatus(status), false)
})

test('keys the backoff by lowercase board address', () => {
  assert.equal(syncFailedKey('0xABCDEF0000000000000000000000000000000001'), 'github:sync-failed:0xabcdef0000000000000000000000000000000001')
})

// A batched client like markeeSync's, answering every request through `answer`.
function batchedClient(answer: (body: { method: string; params: unknown[] }) => unknown) {
  return createPublicClient({ chain: base, batch: { multicall: true }, transport: custom({ request: async (body: { method: string; params: unknown[] }) => answer(body) }) })
}
const VERSION_ABI = parseAbi(['function VERSION() view returns (string)'])
const BOARD = '0x0000000000000000000000000000000000000b0a' as const

test('a reverted VERSION read counts as a missing function', async () => {
  const client = batchedClient(({ method }) => {
    if (method !== 'eth_call') throw new Error(`unexpected ${method}`)
    return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: [{ success: false, returnData: '0x' }] })
  })
  const error = await client.readContract({ address: BOARD, abi: VERSION_ABI, functionName: 'VERSION' }).then(() => null, e => e)
  assert.ok(error, 'expected the read to fail')
  assert.equal(isMissingFunction(error), true)
})

function plainClient(answer: (body: { method: string; params: unknown[] }) => unknown) {
  return createPublicClient({ chain: base, transport: custom({ request: async (body: { method: string; params: unknown[] }) => answer(body) }, { retryCount: 0 }) })
}
const rpcError = (code: number, message: string, data?: string) => Object.assign(new Error(message), { code, message, ...(data ? { data } : {}) })

test('a node-reported revert counts as a missing function', async () => {
  // How a public node reports a call to a function the contract doesn't have.
  const reverted = await plainClient(() => { throw rpcError(3, 'execution reverted', '0x') })
    .readContract({ address: BOARD, abi: VERSION_ABI, functionName: 'VERSION' }).then(() => null, e => e)
  assert.equal(isMissingFunction(reverted), true)
  const noData = await plainClient(() => { throw rpcError(-32603, 'execution reverted') })
    .readContract({ address: BOARD, abi: VERSION_ABI, functionName: 'VERSION' }).then(() => null, e => e)
  assert.equal(isMissingFunction(noData), true)
})

test('an RPC internal error is not a missing function', async () => {
  // viem wraps any -32603 with a message as ContractFunctionRevertedError; a streaming board must not
  // then be read as fixed-price.
  for (const client of [plainClient, batchedClient]) {
    const error = await client(() => { throw rpcError(-32603, 'Internal error') })
      .readContract({ address: BOARD, abi: VERSION_ABI, functionName: 'VERSION' }).then(() => null, e => e)
    assert.ok(error, 'expected the read to fail')
    assert.equal(isMissingFunction(error), false)
  }
})

test('a failed RPC request is not a missing function', async () => {
  const client = batchedClient(() => { throw new Error('upstream 502') })
  const error = await client.readContract({ address: BOARD, abi: VERSION_ABI, functionName: 'VERSION' }).then(() => null, e => e)
  assert.ok(error, 'expected the read to fail')
  assert.equal(isMissingFunction(error), false)
})
