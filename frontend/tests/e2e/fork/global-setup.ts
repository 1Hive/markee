import { ANVIL, FORK_BLOCK, FORK_RPC, KV, KV_TOKEN } from './env'

// Every run starts from the pinned fork block and an empty KV, even when Playwright reuses an Anvil
// and Redis left running by an earlier run (reuseExistingServer outside CI).
export default async function globalSetup() {
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(ANVIL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const body = await res.json()
    if (body.error) throw new Error(`${method}: ${body.error.message}`)
    return body.result
  }
  await rpc('anvil_reset', [{ forking: { jsonRpcUrl: FORK_RPC, blockNumber: FORK_BLOCK } }])

  const res = await fetch(KV, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['FLUSHALL']) })
  if (!res.ok) throw new Error(`KV flush failed: HTTP ${res.status}`)
}
