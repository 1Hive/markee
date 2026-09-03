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
function fakeChain() {
  const writes: { functionName: string; address: Address; args: unknown[] }[] = []
  const publicClient = {
    async readContract(args: unknown) {
      const c = args as Call
      if (c.functionName === 'getLeaderboards') return [boardA, boardB]
      throw new Error(`unexpected read ${c.functionName}`)
    },
    async multicall(args: unknown) {
      const { contracts } = args as { contracts: Call[] }
      return contracts.map(c => {
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
  return { publicClient, walletClient, writes }
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
