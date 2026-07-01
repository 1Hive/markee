// Deterministic check of the keeper's decision logic against a mock viem client. The ON-CHAIN heal
// (getTopMarkees[0] != topMarkee → claimTop flips it) is fork-proven by
// test/StreamingLeaderboard.t.sol::test_getTopMarkees_reflectsLiveRanking_beforeClaimTopHeals; this
// locks the OFF-CHAIN orchestration: stale-top detection, no-op when current, settle filter + chunk.
//
//   npx tsx scripts/keeper-logic-check.mts

import { getAddress } from 'viem'
import { runKeeper, type RunKeeperParams } from '../lib/streaming/keeper'

const FACTORY = '0x00000000000000000000000000000000000facc01' as `0x${string}`
const BOARD = '0x00000000000000000000000000000000000b0a2d' as `0x${string}`
const A = '0x000000000000000000000000000000000000000a' as `0x${string}` // enforced (stale) top
const B = '0x000000000000000000000000000000000000000b' as `0x${string}` // live top by effectiveRate
const BACKER1 = '0x0000000000000000000000000000000000bac001' as `0x${string}` // owed
const BACKER2 = '0x0000000000000000000000000000000000bac002' as `0x${string}` // nothing owed

interface Scenario {
  enforcedTop: `0x${string}`
  liveTop: `0x${string}`
  liveRate: bigint
}

function makeClients(s: Scenario) {
  const sent: { fn: string; args: readonly unknown[] }[] = []

  const publicClient: RunKeeperParams['publicClient'] = {
    async readContract(args: unknown) {
      const a = args as { functionName: string; args?: readonly unknown[] }
      switch (a.functionName) {
        case 'getLeaderboards': return [BOARD]
        case 'topMarkee': return s.enforcedTop
        case 'getTopMarkees': return [[s.liveTop], [s.liveRate]]
        case 'pendingSettlement': return ((a.args?.[0] as string)?.toLowerCase() === BACKER1 ? 5n : 0n)
        default: throw new Error(`unexpected read ${a.functionName}`)
      }
    },
    async getLogs() {
      return [{ args: { backer: BACKER1 } }, { args: { backer: BACKER2 } }]
    },
    async waitForTransactionReceipt() {
      return { status: 'success' as const }
    },
  }

  const walletClient: RunKeeperParams['walletClient'] = {
    chain: { id: 8453 },
    async writeContract(args: unknown) {
      const a = args as { functionName: string; args: readonly unknown[] }
      sent.push({ fn: a.functionName, args: a.args })
      return '0xfeed' as `0x${string}`
    },
  }

  return { publicClient, walletClient, sent }
}

let failures = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
  if (!ok) failures++
}

async function main() {
  // 1. Stale top (live B ≠ enforced A): expect claimTop(B) + settle([BACKER1]).
  {
    const { publicClient, walletClient, sent } = makeClients({ enforcedTop: A, liveTop: B, liveRate: 19_000_000_000n })
    const report = await runKeeper({ publicClient, walletClient, account: '0x000000000000000000000000000000000000keep' as `0x${string}`, factory: FACTORY })
    check('stale: claimTop sent for live top B', sent.find(c => c.fn === 'claimTop')?.args, [B])
    check('stale: settle only owed backer', sent.find(c => c.fn === 'settle')?.args, [[getAddress(BACKER1)]])
    check('stale: both actions confirmed', report.actions.map(a => `${a.kind}:${a.status}`), ['claimTop:confirmed', 'settle:confirmed'])
  }

  // 2. Top already current (live == enforced): no claimTop, still settles.
  {
    const { publicClient, walletClient, sent } = makeClients({ enforcedTop: B, liveTop: B, liveRate: 19_000_000_000n })
    const report = await runKeeper({ publicClient, walletClient, account: '0x000000000000000000000000000000000000keep' as `0x${string}`, factory: FACTORY })
    check('current: no claimTop', sent.some(c => c.fn === 'claimTop'), false)
    check('current: only settle action', report.actions.map(a => a.kind), ['settle'])
  }

  // 3. Live top has zero rate (seed-only board): no claimTop even though addresses differ.
  {
    const { publicClient, walletClient, sent } = makeClients({ enforcedTop: A, liveTop: B, liveRate: 0n })
    await runKeeper({ publicClient, walletClient, account: '0x000000000000000000000000000000000000keep' as `0x${string}`, factory: FACTORY, settle: false })
    check('zero-rate: no claimTop', sent.some(c => c.fn === 'claimTop'), false)
  }

  // 4. Dry run (no walletClient): plans the claimTop but sends nothing.
  {
    const { publicClient } = makeClients({ enforcedTop: A, liveTop: B, liveRate: 19_000_000_000n })
    const report = await runKeeper({ publicClient, factory: FACTORY, settle: false })
    check('dry-run: claimTop planned', report.actions.map(a => `${a.kind}:${a.status}:${a.detail}`), ['claimTop:planned:dry-run'])
  }

  console.log(failures === 0 ? '\n✅ keeper decision logic verified' : `\n❌ ${failures} check(s) failed`)
  if (failures > 0) process.exit(1)
}

main().catch(e => { console.error('ERROR:', e?.message || e); process.exit(1) })
