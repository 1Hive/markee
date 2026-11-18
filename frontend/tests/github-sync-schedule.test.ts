import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicClient, custom, encodeFunctionResult, multicall3Abi, parseAbi } from 'viem'
import { base } from 'viem/chains'
import { FAILED_RETRY_MS, RESYNC_AFTER_MS, isMissingFunction, isPermanentGitHubStatus, boardSyncResult, fileSyncStatus, inBackoff, syncDecision, syncFailedKey, type SyncFileResult } from '../lib/github/syncSchedule'

const now = 1_800_000_000_000

test('syncs a board with no history', () => {
  assert.equal(syncDecision('a', null, now), 'sync')
})

test('skips a board already synced with the same billboard today', () => {
  assert.equal(syncDecision('a', { signature: 'a', at: now - 60_000 }, now), 'unchanged')
})

test('resyncs the same billboard once a day', () => {
  assert.equal(syncDecision('a', { signature: 'a', at: now - RESYNC_AFTER_MS }, now), 'sync')
})

test('syncs at once when the billboard changes', () => {
  assert.equal(syncDecision('b', { signature: 'a', at: now - 60_000 }, now), 'sync')
})

test('backs off a board that failed for a lasting reason, whatever its billboard', () => {
  assert.equal(inBackoff(null, now), false)
  assert.equal(inBackoff({ signature: 'a', at: now - 10 * 60_000 }, now), true)
})

test('retries a failed board once the backoff passes', () => {
  assert.equal(inBackoff({ signature: 'a', at: now - FAILED_RETRY_MS }, now), false)
})

// ─── Which failures back off ────────────────────────────────────────────────


const file = (over: Partial<SyncFileResult>): SyncFileResult => ({ repoFullName: 'o/r', filePath: 'README.md', success: false, ...over })

test('backs off only when every failed file failed for a lasting reason', () => {
  assert.equal(boardSyncResult([file({ permanent: true, error: 'Address-specific delimiters not found in file' })]), 'backoff')
  assert.equal(boardSyncResult([file({ permanent: true }), file({ permanent: false, error: 'Write failed (502)' })]), 'retry')
  assert.equal(boardSyncResult([file({ error: 'Sync failed' })]), 'retry')
  assert.equal(boardSyncResult([]), 'retry')
})

test('a board is synced only when every file synced', () => {
  assert.equal(boardSyncResult([file({ success: true }), file({ success: true, unchanged: true })]), 'synced')
  // One file current, the other hit a GitHub 502: retry next run instead of recording the board as synced.
  assert.equal(boardSyncResult([file({ success: true }), file({ error: 'Write failed (502)' })]), 'retry')
  // One file current, the other lost its delimiters: back off; the current file needs nothing more.
  assert.equal(boardSyncResult([file({ success: true }), file({ permanent: true, error: 'Address-specific delimiters not found in file' })]), 'backoff')
})

test('each file keeps its own sync status', () => {
  assert.deepEqual(fileSyncStatus(file({ success: true }), 5), { ok: true, at: 5 })
  assert.deepEqual(fileSyncStatus(file({ permanent: true, error: 'Fetch failed (404)' }), 5), { ok: false, at: 5, error: 'Fetch failed (404)', permanent: true })
  assert.deepEqual(fileSyncStatus(file({}), 5), { ok: false, at: 5, error: 'Sync failed', permanent: false })
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
