import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeFunctionData, parseAbiItem, type Address, type Hex } from 'viem'
import { MULTICALL3, runSettler } from '../lib/streaming/settler'

const factory = '0xffffffffffffffffffffffffffffffffffffffff' as Address
const boardA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const boardB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const boardC = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const keeper = '0x4444444444444444444444444444444444444444' as Address
const SETTLE = parseAbiItem('function settle(address[] backers)')
const ETHX = 10n ** 18n

function backer(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address
}

interface Call { functionName: string; address: Address; args?: unknown[] }
interface Write { address: Address; args: [{ target: Address; callData: Hex }[]]; gas: bigint }

function fakeChain(pending: Record<Address, Record<Address, bigint>>, opts: { gasPerBacker?: bigint; revertBoards?: Address[] } = {}) {
  const writes: Write[] = []
  const boards = Object.keys(pending) as Address[]
  const publicClient = {
    async readContract(args: unknown) {
      if ((args as Call).functionName === 'getLeaderboards') return boards
      throw new Error('unexpected read')
    },
    async multicall(args: unknown) {
      const { contracts } = args as { contracts: Call[] }
      return contracts.map(c => {
        const owed = Object.entries(pending[c.address]).find(([a]) => a.toLowerCase() === String(c.args![0]).toLowerCase())
        return { status: 'success', result: owed![1] }
      })
    },
    async estimateGas(args: unknown) {
      const { to, data } = args as { to: Address; data: Hex }
      if (opts.revertBoards?.includes(to)) throw new Error('execution reverted')
      const { args: [backers] } = decodeFunctionData({ abi: [SETTLE], data })
      return 1_900_000n + (opts.gasPerBacker ?? 700_000n) * BigInt(backers.length - 1)
    },
    async waitForTransactionReceipt() {
      return { status: 'success' as const }
    },
  }
  const walletClient = {
    account: { address: keeper },
    async writeContract(args: unknown) {
      writes.push(args as Write)
      return `0x${writes.length.toString(16).padStart(64, '0')}` as Hex
    },
  }
  const fetchBackers = async (bs: Address[]) =>
    new Map(bs.map(b => [b.toLowerCase(), Object.keys(pending[b]).map(a => a.toLowerCase())]))
  return { publicClient, walletClient, fetchBackers, writes }
}

function settledBackers(w: Write) {
  return w.args[0].map(c => [c.target, decodeFunctionData({ abi: [SETTLE], data: c.callData }).args[0]])
}

test('settles every owed backer across boards in one multicall and skips dust', async () => {
  const { publicClient, walletClient, fetchBackers, writes } = fakeChain({
    [boardA]: { [backer(1)]: ETHX / 100n, [backer(2)]: 1n },
    [boardB]: { [backer(3)]: ETHX / 1000n },
    [boardC]: { [backer(4)]: 0n },
  })
  const report = await runSettler({ publicClient, walletClient, factory, fetchBackers })

  assert.equal(writes.length, 1)
  assert.equal(writes[0].address, MULTICALL3)
  assert.deepEqual(settledBackers(writes[0]), [[boardA, [backer(1)]], [boardB, [backer(3)]]])
  assert.equal(report.backers, 2)
  assert.equal(report.pending, ETHX / 100n + ETHX / 1000n)
  assert.ok(report.actions.every(a => a.status === 'confirmed'))
})

test('packs batches under the per-transaction gas cap', async () => {
  const pending: Record<Address, Record<Address, bigint>> = {}
  for (let b = 0; b < 10; b++) pending[backer(1000 + b)] = { [backer(b)]: ETHX }
  const { publicClient, walletClient, fetchBackers, writes } = fakeChain(pending)
  await runSettler({ publicClient, walletClient, factory, fetchBackers })

  assert.deepEqual(writes.map(w => w.args[0].length), [6, 4])
  assert.ok(writes.every(w => w.gas <= 16_000_000n))
})

test('splits a board with many backers into several settle calls', async () => {
  const many: Record<Address, bigint> = {}
  for (let i = 1; i <= 10; i++) many[backer(i)] = ETHX
  const { publicClient, walletClient, fetchBackers, writes } = fakeChain({ [boardA]: many })
  const report = await runSettler({ publicClient, walletClient, factory, fetchBackers })

  assert.deepEqual(report.actions.map(a => a.backers.length), [8, 2])
  assert.deepEqual(writes.flatMap(w => settledBackers(w).map(([, b]) => (b as Address[]).length)), [8, 2])
})

test('a board whose settle reverts in estimation is reported and left out of the batch', async () => {
  const { publicClient, walletClient, fetchBackers, writes } = fakeChain(
    { [boardA]: { [backer(1)]: ETHX }, [boardB]: { [backer(2)]: ETHX } },
    { revertBoards: [boardA] },
  )
  const report = await runSettler({ publicClient, walletClient, factory, fetchBackers })

  assert.deepEqual(settledBackers(writes[0]), [[boardB, [backer(2)]]])
  assert.deepEqual(report.actions.map(a => [a.board, a.status]), [[boardA, 'error'], [boardB, 'confirmed']])
})

test('dry run plans without estimating or signing', async () => {
  const { publicClient, fetchBackers, writes } = fakeChain({ [boardA]: { [backer(1)]: ETHX } })
  const report = await runSettler({ publicClient, factory, fetchBackers })

  assert.equal(writes.length, 0)
  assert.deepEqual(report.actions.map(a => [a.status, a.detail]), [['planned', 'dry-run']])
})
