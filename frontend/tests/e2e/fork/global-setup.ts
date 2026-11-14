import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { encodeFunctionData, parseAbi, parseEther } from 'viem'
import { ANVIL, APP_PORT, E2E_ACCOUNT, FORK_BLOCK, KV, KV_TOKEN } from './env'

// Every run starts from the same chain state and an empty KV, even when Playwright reuses an Anvil
// and Redis left running by an earlier run (reuseExistingServer outside CI).
//
// Chain state is restored with evm_snapshot / evm_revert rather than anvil_reset: a reset throws away
// every storage slot Anvil has already pulled from the upstream RPC, so the next run's first
// transaction re-fetches hundreds of slots and can take minutes. A revert keeps that cache warm.
const SNAPSHOT_FILE = join(__dirname, '.anvil-snapshot')
const INSTANCE_FILE = join(__dirname, '.anvil-instance')
const FOR_SALE_BOARD = '0xa52EB22029677029D4e609aD5e54ca6552c0B31F'
const BOARD_BEACONS = join(__dirname, 'board-beacons.json')

async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(ANVIL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

export default async function globalSetup() {
  const accounts = await rpc<string[]>('eth_accounts', [])
  if (!accounts.map(a => a.toLowerCase()).includes(E2E_ACCOUNT.toLowerCase())) {
    throw new Error(`Anvil on ${ANVIL} doesn't have the E2E account unlocked: it was started without the E2E mnemonic. Stop it and let Playwright start it (see playwright.fork.config.ts).`)
  }
  const instance = existsSync(INSTANCE_FILE) ? readFileSync(INSTANCE_FILE, 'utf8').trim() : null
  if (!instance) throw new Error('Start the E2E fork with tests/e2e/fork/server.mjs so RPC counts and cache flushing are enabled.')
  let saved: { instance: string; snapshot: string } | null = null
  try { saved = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) } catch { /* new fork or legacy snapshot */ }
  const reused = saved?.instance === instance
  const reverted = reused ? await rpc('evm_revert', [saved!.snapshot]).catch(() => false) : false
  if (!reverted) {
    // A new wrapper instance started Anvil at the pinned block already. Resetting
    // it here would throw away the storage it just restored from disk.
    if (reused || Number(await rpc<string>('eth_blockNumber', [])) !== FORK_BLOCK) {
      throw new Error('The E2E fork cannot restore its clean snapshot. Restart the local fork server before retrying.')
    }
    await deployBoardBeacons()
    await rpc('eth_call', [{
      from: E2E_ACCOUNT,
      to: FOR_SALE_BOARD,
      value: `0x${parseEther('0.004').toString(16)}`,
      data: encodeFunctionData({ abi: parseAbi(['function createMarkee(string,string) payable returns (address)']), functionName: 'createMarkee', args: ['warm-up', ''] }),
    }, 'latest']).catch(() => {})
  }
  writeFileSync(SNAPSHOT_FILE, JSON.stringify({ instance, snapshot: await rpc('evm_snapshot', []) }))

  const res = await fetch(KV, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['FLUSHALL']) })
  if (!res.ok) throw new Error(`KV flush failed: HTTP ${res.status}`)

  await warmUp()
}

// The pinned block predates the beacon-backed v1.4 factories and migrators. Replaying the recorded
// mainnet deployment from the same deployer and starting nonce recreates them at their real addresses,
// so the fork matches production before any board has migrated.
async function deployBoardBeacons() {
  const { deployer, nonce, transactions } = JSON.parse(readFileSync(BOARD_BEACONS, 'utf8')) as {
    deployer: string; nonce: string; transactions: { to: string | null; data: string; gas: string; address?: string }[]
  }
  if (await rpc<string>('eth_getCode', [transactions.find(t => t.address)!.address, 'latest']) !== '0x') return
  await rpc('anvil_impersonateAccount', [deployer])
  await rpc('anvil_setBalance', [deployer, `0x${parseEther('1').toString(16)}`])
  await rpc('anvil_setNonce', [deployer, nonce])
  for (const tx of transactions) {
    const hash = await rpc<string>('eth_sendTransaction', [{ from: deployer, ...(tx.to ? { to: tx.to } : {}), data: tx.data, gas: tx.gas }])
    let receipt: { status: string; contractAddress: string | null } | null = null
    for (let attempt = 0; !receipt && attempt < 60; attempt++) {
      receipt = await rpc('eth_getTransactionReceipt', [hash])
      if (!receipt) await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (!receipt) throw new Error(`Board beacon deployment replay was never mined: ${hash}`)
    if (receipt.status !== '0x1') throw new Error(`Board beacon deployment replay reverted at ${tx.address ?? tx.to}`)
    if (tx.address && receipt.contractAddress?.toLowerCase() !== tx.address.toLowerCase()) {
      throw new Error(`Board beacon replay deployed ${receipt.contractAddress}, expected ${tx.address}`)
    }
  }
  await rpc('anvil_stopImpersonatingAccount', [deployer])
}

// The first request to each route compiles it (next dev) and makes Anvil fetch the factories' log
// history from the upstream RPC, which on a cold runner can take minutes. Do that here, outside any
// test's timeout. Failures are ignored: a test that needs the route will report it properly.
async function warmUp() {
  const app = `http://localhost:${APP_PORT}`
  const get = (path: string) => fetch(app + path, { signal: AbortSignal.timeout(300_000) }).catch(() => {})
  for (const platform of ['superfluid', 'github', 'openinternet', 'streaming', 'forsale']) await get(`/api/${platform}/leaderboards`)
  await Promise.all([
    get(`/api/account/messages?owner=${E2E_ACCOUNT}`),
    get(`/api/account/funded?owner=${E2E_ACCOUNT}`),
    get('/account'),
    get(`/markee/${FOR_SALE_BOARD}`),
  ])
}
