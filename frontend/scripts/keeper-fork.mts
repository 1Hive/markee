// Runs the real keeper (lib/streaming/keeper.ts) against a streaming factory on a fork (or any RPC).
// Dry-run by default — reads every board + plans claimTop/settle but sends nothing. LIVE=1 actually
// sends, signing with PK (defaults to anvil account[0]). Use after standing up a fork board (see the
// deploy flow in the streaming memory / DeployStreamingFactory.s.sol) to smoke-test execution:
// open two streams, lower the top backer's rate below the rival, then run this with LIVE=1 and watch
// claimTop flip topMarkee (the heal that test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals
// proves on-chain).
//
//   FACTORY=0x.. [RPC=http://localhost:8545] [LIVE=1] [PK=0x..] npx tsx scripts/keeper-fork.mts

import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { runKeeper } from '../lib/streaming/keeper'

const RPC = process.env.RPC ?? 'http://localhost:8545'
const FACTORY = process.env.FACTORY as `0x${string}` | undefined
const LIVE = process.env.LIVE === '1'
const FROM_BLOCK = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : undefined
// anvil account[0]
const PK = (process.env.PK ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`

if (!FACTORY) {
  console.error('set FACTORY=0x.. (the StreamingLeaderboardFactory address)')
  process.exit(1)
}

const publicClient = createPublicClient({ chain: base, transport: http(RPC) })

let walletClient: ReturnType<typeof createWalletClient> | undefined
let account: `0x${string}` | undefined
if (LIVE) {
  const signer = privateKeyToAccount(PK)
  account = signer.address
  walletClient = createWalletClient({ account: signer, chain: base, transport: http(RPC) })
  console.log(`LIVE — signing as ${account}`)
} else {
  console.log('DRY RUN — planning only (set LIVE=1 to send)')
}

const report = await runKeeper({
  publicClient,
  walletClient,
  account,
  factory: FACTORY,
  fromBlock: FROM_BLOCK,
  log: (m) => console.log('[keeper]', m),
})

console.log(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
