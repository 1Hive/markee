import assert from 'node:assert/strict'
import test from 'node:test'
import type { Address } from 'viem'
import { runKeeper } from '../lib/streaming/keeper'

const factory = '0xffffffffffffffffffffffffffffffffffffffff' as Address
const boardA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const boardB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const deadTop = '0x1111111111111111111111111111111111111111' as Address
const liveTop = '0x2222222222222222222222222222222222222222' as Address
const keeper = '0x4444444444444444444444444444444444444444' as Address

interface Call { functionName: string; address: Address; args?: unknown[] }

// Two boards whose enforced top is deadTop. On boardA its backer ran out of money (aggregate 0) while
// liveTop still streams; on boardB deadTop is still the live #1.
function fakeChain(opts: { brokenBoards?: Address[]; failMultiBoardChunks?: boolean } = {}) {
  const writes: { functionName: string; address: Address; args: unknown[] }[] = []
  const multicalls: number[] = []
  const publicClient = {
    async readContract(args: unknown) {
      const c = args as Call
      if (c.functionName === 'getLeaderboards') return [boardA, boardB]
      throw new Error(`unexpected read ${c.functionName}`)
    },
    async multicall(args: unknown) {
      const { contracts } = args as { contracts: Call[] }
      const boardsInChunk = new Set(contracts.map(c => c.address)).size
      multicalls.push(boardsInChunk)
      // An oversized board blows the shared eth_call gas cap: viem then reports every read in the
      // chunk as failed.
      if (opts.failMultiBoardChunks && boardsInChunk > 1) {
        return contracts.map(() => ({ status: 'failure', error: new Error('out of gas') }))
      }
      return contracts.map(c => {
        if (opts.brokenBoards?.includes(c.address)) return { status: 'failure', error: new Error('execution reverted') }
        if (c.functionName === 'topMarkee') return { status: 'success', result: deadTop }
        if (c.functionName === 'getTopMarkees') {
          return c.address === boardA
            ? { status: 'success', result: [[liveTop], [1_000n]] }
            : { status: 'success', result: [[deadTop], [500n]] }
        }
        throw new Error(`unexpected multicall ${c.functionName}`)
      })
    },
    async waitForTransactionReceipt() { return { status: 'success' } },
  }
  const walletClient = {
    chain: undefined,
    async writeContract(args: unknown) {
      const c = args as Call
      writes.push({ functionName: c.functionName, address: c.address, args: c.args ?? [] })
      return `0x${writes.length.toString(16).padStart(64, '0')}` as `0x${string}`
    },
  }
  return { publicClient, walletClient, writes, multicalls }
}

test('promotes the live #1 over a drained top and leaves healthy boards alone', async () => {
  const { publicClient, walletClient, writes } = fakeChain()
  const report = await runKeeper({ publicClient, walletClient, account: keeper, factory })

  assert.equal(report.boards, 2)
  assert.deepEqual(writes, [{ functionName: 'claimTop', address: boardA, args: [liveTop] }])
  assert.deepEqual(report.actions.map(a => [a.board, a.status, a.challenger]), [[boardA, 'confirmed', liveTop]])
})

test('dry run plans the claimTop without signing', async () => {
  const { publicClient, writes } = fakeChain()
  const report = await runKeeper({ publicClient, factory })
  assert.equal(writes.length, 0)
  assert.deepEqual(report.actions.map(a => [a.status, a.detail]), [['planned', 'dry-run']])
})

test('a failed claimTop is reported and does not stop the run', async () => {
  const { publicClient, walletClient } = fakeChain()
  walletClient.writeContract = async () => { throw new Error('nonce too low') }
  const report = await runKeeper({ publicClient, walletClient, account: keeper, factory })
  assert.deepEqual(report.actions.map(a => [a.status, a.detail]), [['error', 'nonce too low']])
})

test('retries each board alone when a shared read chunk fails, so the heal still lands', async () => {
  const { publicClient, walletClient, writes, multicalls } = fakeChain({ failMultiBoardChunks: true })
  const report = await runKeeper({ publicClient, walletClient, account: keeper, factory })
  assert.deepEqual(multicalls, [2, 1, 1])
  assert.deepEqual(writes, [{ functionName: 'claimTop', address: boardA, args: [liveTop] }])
  assert.deepEqual(report.actions.map(a => [a.board, a.status]), [[boardA, 'confirmed']])
})

test('a board whose reads fail on their own is reported without blocking the others', async () => {
  const { publicClient, walletClient, writes } = fakeChain({ brokenBoards: [boardB] })
  const report = await runKeeper({ publicClient, walletClient, account: keeper, factory })
  assert.deepEqual(writes, [{ functionName: 'claimTop', address: boardA, args: [liveTop] }])
  assert.deepEqual(report.actions.map(a => [a.board, a.status, a.detail]), [
    [boardA, 'confirmed', undefined],
    [boardB, 'error', 'execution reverted'],
  ])
})
