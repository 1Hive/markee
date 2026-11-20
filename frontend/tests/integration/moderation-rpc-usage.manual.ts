import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createPublicClient, http, decodeFunctionData, encodeFunctionResult, encodeAbiParameters, encodeEventTopics, parseAbi, type Address } from 'viem'
import { base } from 'viem/chains'
import { FACTORIES } from '../../lib/contracts/addresses'
import { runModerationScan, scanDeps } from '../../lib/moderation/scan'
import { automaticDeps } from '../../lib/moderation/automatic'
import { membershipDeps } from '../../lib/moderation/membership'
import { itemKey } from '../../lib/moderation/server'
import budget from './rpc-monthly-budget.json'
import { monthlyForecast } from './rpc-monthly-forecast'

// Manual, credential-free integration of the actual scanner, automatic checker,
// membership verifier and viem HTTP/multicall encoder. No sockets or external I/O.
// Activity/email/history sinks are isolated; their RPC usage is not in this budget.
const board: Address = '0x1111111111111111111111111111111111111111'
const owner: Address = '0x2222222222222222222222222222222222222222'
const ids = Array.from({ length: 1000 }, (_, i) => `0x${(i + 100).toString(16).padStart(40, '0')}` as Address)
const abi = parseAbi([
  'function leaderboardCount() view returns (uint256)',
  'function getLeaderboards(uint256,uint256) view returns (address[])',
  'function status(address) view returns (uint8)',
  'function predecessorOf(address) view returns (address)',
  'function markeeCount() view returns (uint256)',
  'function getTopMarkees(uint256) view returns (address[],uint256[])',
  'function getMarkees(uint256,uint256) view returns (address[])',
  'function factory() view returns (address)',
  'function isFactoryLeaderboard(address) view returns (bool)',
  'function isMarkeeOnLeaderboard(address) view returns (bool)',
  'function markeeAddress() view returns (address)',
  'function message() view returns (string)',
  'function name() view returns (string)',
  'function owner() view returns (address)',
])
const aggregate = parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)'])
const edits = parseAbi(['event MessageChanged(string newMessage, address indexed changedBy)'])
const trustFunctions = new Set(['factory', 'isFactoryLeaderboard', 'isMarkeeOnLeaderboard', 'markeeAddress'])
const zero = '0x0000000000000000000000000000000000000000'
const hash = `0x${'1'.repeat(64)}`
let head = 60000000n, at = 1000000n, edited = false, failMembership = false
let counts: Record<string, number> = {}, subcalls: Record<string, number> = {}
let largestTrustBatch = 0, activeTrust = 0, peakTrust = 0
const records = new Map<string, any>()

const client = createPublicClient({ chain: base, transport: http('https://fixture.invalid', {
  retryCount: 0,
  async fetchFn(_input, init) {
    const request = JSON.parse(String(init?.body))
    const { method, params, id } = request
    counts[method] = (counts[method] ?? 0) + 1
    const response = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result })
    if (method === 'eth_blockNumber') return response(`0x${head.toString(16)}`)
    if (method === 'eth_getBlockByNumber') return response({ number: `0x${head.toString(16)}`, timestamp: `0x${at.toString(16)}`, hash, parentHash: hash, transactions: [] })
    if (method === 'eth_getLogs') return response(edited ? [{ address: ids[0], blockNumber: `0x${head.toString(16)}`, blockHash: hash, transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false,
      topics: encodeEventTopics({ abi: edits, eventName: 'MessageChanged', args: { changedBy: owner } }),
      data: encodeAbiParameters([{ type: 'string' }], ['edited message']),
    }] : [])
    assert.equal(method, 'eth_call', `Unexpected RPC method: ${method}`)
    assert.equal(params[1], `0x${head.toString(16)}`, 'all contract reads must use the scan head')
    const contracts = decodeFunctionData({ abi: aggregate, data: params[0].data }).args![0]
    const reads = contracts.map(contract => ({ contract, read: decodeFunctionData({ abi, data: contract.callData }) }))
    const trustOnly = reads.every(({ read }) => trustFunctions.has(read.functionName))
    if (trustOnly) {
      largestTrustBatch = Math.max(largestTrustBatch, reads.length)
      assert.ok((params[0].data.length - 2) / 2 < 64 * 1024)
      activeTrust++; peakTrust = Math.max(peakTrust, activeTrust)
      await new Promise<void>(resolve => setImmediate(resolve)); activeTrust--
    }
    return response(encodeFunctionResult({ abi: aggregate, functionName: 'aggregate3', result: reads.map(({ contract, read }) => {
      const fn = read.functionName
      subcalls[fn] = (subcalls[fn] ?? 0) + 1
      if (failMembership && fn === 'isMarkeeOnLeaderboard') return { success: false, returnData: '0x' as const }
      const ownBoard = contract.target.toLowerCase() === board
      const values: Record<string, unknown> = {
        leaderboardCount: contract.target.toLowerCase() === FACTORIES.GITHUB.toLowerCase() ? 1n : 0n,
        getLeaderboards: [board], status: 0, predecessorOf: zero,
        markeeCount: ownBoard ? BigInt(ids.length) : 0n,
        getTopMarkees: ownBoard ? [ids.slice(0, 50), ids.slice(0, 50).map(() => 1n)] : [[], []],
        getMarkees: ids, factory: FACTORIES.GITHUB, isFactoryLeaderboard: true,
        isMarkeeOnLeaderboard: true, markeeAddress: ids[0], owner, name: 'Fixture',
        message: edited && contract.target.toLowerCase() === ids[0] ? 'edited message' : 'fixture message',
      }
      return { success: true, returnData: encodeFunctionResult({ abi, functionName: fn, result: values[fn] as never }) }
    }) }))
  },
}) })

function installStorage() {
  mock.method(scanDeps, 'client', () => client)
  // If a future regression drops the pinned context, count its head request
  // through this fixture too, rather than ever falling back to a real RPC URL.
  mock.method(membershipDeps, 'client', () => client)
  mock.method(automaticDeps, 'client', () => client)
  for (const deps of [scanDeps, automaticDeps]) {
    mock.method(deps, 'get', async (key: string) => structuredClone(records.get(key) ?? null))
    mock.method(deps, 'set', async (key: string, value: unknown) => { records.set(key, structuredClone(value)); return 'OK' })
    mock.method(deps, 'pipeline', () => {
      const writes: (() => void)[] = []
      const pipeline = {
        set(key: string, value: unknown) { writes.push(() => { records.set(key, structuredClone(value)) }); return pipeline },
        sadd() { return pipeline }, srem() { return pipeline }, zadd() { return pipeline }, zrem() { return pipeline },
        async exec() { writes.forEach(write => write()); return [] },
      }
      return pipeline
    })
  }
  mock.method(scanDeps, 'mget', async (...keys: string[]) => keys.map(key => structuredClone(records.get(key) ?? null)))
  mock.method(scanDeps, 'readItems', async (items: string[]) => items.map(id => structuredClone(records.get(itemKey(id)) ?? null)))
  mock.method(scanDeps, 'readAllFlagged', async () => ({ board: [], site: [] }))
  mock.method(scanDeps, 'kvCopied', async (boards: string[]) => boards.map(() => true))
  mock.method(scanDeps, 'recordActivity', async () => ({ events: 0, byWallet: new Map() }))
  mock.method(scanDeps, 'notifyLowBudgets', async () => 0)
  mock.method(scanDeps, 'notifyStatusChanges', async () => 0)
  mock.method(scanDeps, 'updateTopHistories', async () => {})
}

async function main() {
  const previous = process.env.FLAG_AUTO_MODERATION
  process.env.FLAG_AUTO_MODERATION = 'true'
  installStorage()
  const results: unknown[] = []
  let passed = false
  let forecast: ReturnType<typeof monthlyForecast> | { status: 'not-checked'; reason: string } = { status: 'not-checked', reason: 'Fixture scenarios have not completed' }
  let currentScenario = ''
  try {
    for (const [scenario, elapsed, budget] of [
      ['cold', 0, 18], ['warm', 300, 16], ['edit', 300, 17], ['hourly-reconcile', 3600, 18], ['membership-unavailable', 300, 16],
    ] as const) {
      currentScenario = scenario
      head += BigInt(elapsed / 2); at += BigInt(elapsed)
      edited = scenario === 'edit'; failMembership = scenario === 'membership-unavailable'
      counts = {}; subcalls = {}; largestTrustBatch = 0; peakTrust = 0
      const before = structuredClone([...records])
      if (failMembership) {
        await assert.rejects(runModerationScan(), /membership read failed; retaining checkpoints/)
        assert.deepEqual([...records], before, 'failed membership must not publish or advance checkpoints')
      } else {
        const report = await runModerationScan()
        assert.equal(report.markees, 1000)
        if (edited) assert.equal(records.get(itemKey(ids[0])).message, 'edited message')
      }
      assert.equal(counts.eth_blockNumber ?? 0, 0, 'no redundant head reads')
      assert.equal(counts.eth_getBlockByNumber, 1)
      assert.ok(counts.eth_call <= budget, `${scenario}: ${counts.eth_call} eth_calls exceeds budget ${budget}`)
      assert.ok(largestTrustBatch <= 128)
      assert.equal(peakTrust, 1)
      const costs: Record<string, number> = { eth_call: 26, eth_blockNumber: 10, eth_getBlockByNumber: 16, eth_getLogs: 60 }
      const estimatedCU = Object.entries(counts).reduce((sum, [method, count]) => { assert.ok(method in costs); return sum + count * costs[method] }, 0)
      results.push({ scenario, methods: { ...counts }, subcalls: { ...subcalls }, largestTrustBatch, peakTrust, estimatedCU, ethCallBudget: budget })
    }
    currentScenario = 'monthly-forecast'
    forecast = { status: 'not-checked', reason: 'No valid fresh Alchemy MCP export supplied' }
    const args = process.argv.slice(2)
    if (args.length === 1 && args[0] === '--fixtures-only') {
      forecast = { status: 'not-checked', reason: 'Explicit --fixtures-only run; monthly limit has not been verified' }
    } else {
      assert.ok(args.length === 2 && args[0] === '--alchemy-usage', 'Monthly forecast requires --alchemy-usage <fresh MCP export.json>; use --fixtures-only only for offline RPC regression checks')
      const input = JSON.parse(await readFile(args[1], 'utf8'))
      forecast = monthlyForecast(input, budget)
      assert.equal(forecast.status, 'passed', `Projected monthly CU ${forecast.projectedMonthEndCU.toLocaleString('en-US')} exceeds limit ${budget.monthlyLimitCU.toLocaleString('en-US')}`)
    }
    passed = true
  } finally {
    mock.restoreAll()
    if (previous === undefined) delete process.env.FLAG_AUTO_MODERATION
    else process.env.FLAG_AUTO_MODERATION = previous
    await mkdir('test-results/rpc-usage', { recursive: true })
    const report = { schemaVersion: 2, status: passed ? forecast.status === 'not-checked' ? 'fixtures-only' : 'passed' : 'failed', mode: 'deterministic-fixture', members: ids.length, generatedAt: new Date().toISOString(), costsAreEstimates: true, monthlyForecast: forecast,
      excludes: ['activity', 'email', 'top-history', 'Alchemy billing'], results,
      ...(!passed ? { failedScenario: currentScenario, failedMethods: counts, failedSubcalls: subcalls } : {}),
    }
    await writeFile('test-results/rpc-usage/moderation.json', JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report, null, 2))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
