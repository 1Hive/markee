// Runs the moderation scan's #1-history update (lib/leaderboard/topHistory.ts) for the given boards
// against the fork and the local KV. Called by win-times.spec.ts through tsx: the module chain is ESM,
// which Playwright's test loader can't import.
//   tsx tests/e2e/fork/advance-history.ts sale:0xBoard [streaming:0xBoard ...]
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { ANVIL, KV, KV_TOKEN } from './env'

process.env.KV_REST_API_URL = KV
process.env.KV_REST_API_TOKEN = KV_TOKEN

async function main() {
  const { updateTopHistories } = await import('../../../lib/leaderboard/topHistory')
  const client = createPublicClient({ chain: base, transport: http(ANVIL) })
  const boards = process.argv.slice(2).map(arg => {
    const [kind, address] = arg.split(':')
    return { kind: kind as 'sale' | 'streaming', address: address.toLowerCase() }
  })
  await updateTopHistories(client, boards, await client.getBlockNumber())
}
main().catch(e => { console.error(e); process.exit(1) })
