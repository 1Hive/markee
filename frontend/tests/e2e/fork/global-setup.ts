import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { encodeFunctionData, parseAbi, parseEther } from 'viem'
import { ANVIL, APP_PORT, FORK_BLOCK, FORK_RPC, KV, KV_TOKEN } from './env'

// Every run starts from the same chain state and an empty KV, even when Playwright reuses an Anvil
// and Redis left running by an earlier run (reuseExistingServer outside CI).
//
// Chain state is restored with evm_snapshot / evm_revert rather than anvil_reset: a reset throws away
// every storage slot Anvil has already pulled from the upstream RPC, so the next run's first
// transaction re-fetches hundreds of slots and can take minutes. A revert keeps that cache warm.
const SNAPSHOT_FILE = join(__dirname, '.anvil-snapshot')
const E2E_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const FOR_SALE_BOARD = '0xa52EB22029677029D4e609aD5e54ca6552c0B31F'

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(ANVIL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

export default async function globalSetup() {
  const saved = existsSync(SNAPSHOT_FILE) ? readFileSync(SNAPSHOT_FILE, 'utf8').trim() : null
  // evm_revert returns false (or errors) when this Anvil never took that snapshot, e.g. it restarted.
  const reverted = saved ? await rpc('evm_revert', [saved]).catch(() => false) : false
  if (!reverted) {
    await rpc('anvil_reset', [{ forking: { jsonRpcUrl: FORK_RPC, blockNumber: FORK_BLOCK } }])
    // Cold fork: run the purchase path once without sending it, so the slow upstream fetches happen
    // here instead of inside a test's transaction timeout.
    await rpc('eth_call', [{
      from: E2E_ACCOUNT,
      to: FOR_SALE_BOARD,
      value: `0x${parseEther('0.004').toString(16)}`,
      data: encodeFunctionData({ abi: parseAbi(['function createMarkee(string,string) payable returns (address)']), functionName: 'createMarkee', args: ['warm-up', ''] }),
    }, 'latest']).catch(() => {})
  }
  writeFileSync(SNAPSHOT_FILE, await rpc('evm_snapshot', []))

  const res = await fetch(KV, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['FLUSHALL']) })
  if (!res.ok) throw new Error(`KV flush failed: HTTP ${res.status}`)

  await warmUp()
}

// The first request to each route compiles it (next dev) and makes Anvil fetch the factories' log
// history from the upstream RPC, which on a cold runner can take minutes. Do that here, outside any
// test's timeout. Failures are ignored: a test that needs the route will report it properly.
async function warmUp() {
  const app = `http://localhost:${APP_PORT}`
  const get = (path: string) => fetch(app + path, { signal: AbortSignal.timeout(300_000) }).catch(() => {})
  await Promise.all(['superfluid', 'github', 'openinternet', 'streaming', 'forsale'].map(p => get(`/api/${p}/leaderboards`)))
  await Promise.all([
    get(`/api/account/messages?owner=${E2E_ACCOUNT}`),
    get(`/api/account/funded?owner=${E2E_ACCOUNT}`),
    get('/account'),
    get(`/markee/${FOR_SALE_BOARD}`),
  ])
}
