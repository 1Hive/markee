// Deterministic check of the StreamingMarkee read transform: the hook zips getTopMarkees
// (addresses, effectiveRates) with per-Markee fields, drops zero-rate entries (seed/unbacked),
// and the page renders each rate via formatRate. The on-chain ranking itself is fork-verified by
// test/StreamingLeaderboard.t.sol::test_getTopMarkees_*; this locks the JS round-trip + display.
//
//   npx tsx scripts/verify-streaming-read.mts

import { formatEther } from 'viem'
import { monthlyToRatePerSec, ratePerSecToMonthly } from '../lib/superfluid/streaming'

// Mirror of app/ecosystem/platforms/streaming/[address]/page.tsx formatRate.
function formatRate(weiPerSec: bigint): string {
  const eth = parseFloat(formatEther(ratePerSecToMonthly(weiPerSec)))
  if (eth === 0) return '0 ETH/mo'
  if (eth < 0.00005) return '< 0.0001 ETH/mo'
  return `${eth.toFixed(4).replace(/\.?0+$/, '')} ETH/mo`
}

// Mirror of useStreamingMarkees zip + filter (getTopMarkees returns descending-rate order).
function toRanked(addresses: string[], rates: bigint[], details: { message: string; name: string; owner: string }[]) {
  return addresses
    .map((address, i) => ({ address, ...details[i], rate: rates[i] ?? 0n }))
    .filter(m => m.rate > 0n)
}

let failures = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
  if (!ok) failures++
}

// 1. formatRate round-trips a monthly rate through wei/sec truncation back to the displayed monthly.
for (const monthly of ['0.05', '0.02', '0.123', '0.0001', '1']) {
  const ratePerSec = monthlyToRatePerSec(BigInt(Math.round(Number(monthly) * 1e6)) * 10n ** 12n)
  check(`formatRate(${monthly} ETH/mo)`, formatRate(ratePerSec), `${monthly} ETH/mo`)
}

// 2. A sub-minimum dust rate renders as "< 0.0001", and zero renders as "0".
check('formatRate(dust)', formatRate(1n), '< 0.0001 ETH/mo')
check('formatRate(0)', formatRate(0n), '0 ETH/mo')

// 3. The transform keeps getTopMarkees order, drops the zero-rate seed, and pairs the right fields.
const C = '0x000000000000000000000000000000000000000c'
const A = '0x000000000000000000000000000000000000000a'
const B = '0x000000000000000000000000000000000000000b'
const SEED = '0x000000000000000000000000000000000000dead'
const r = (m: string) => monthlyToRatePerSec(BigInt(Math.round(Number(m) * 1e6)) * 10n ** 12n)
const ranked = toRanked(
  [C, A, B, SEED],
  [r('0.09'), r('0.05'), r('0.02'), 0n],
  [
    { message: 'c msg', name: 'cee', owner: C },
    { message: 'a msg', name: 'aye', owner: A },
    { message: 'b msg', name: 'bee', owner: B },
    { message: '', name: '', owner: SEED },
  ],
)
check('ranked length (seed dropped)', ranked.length, 3)
check('ranked order', ranked.map(m => m.address), [C, A, B])
check('ranked top message paired', ranked[0].message, 'c msg')
check('ranked rates descending', ranked.map(m => formatRate(m.rate)), ['0.09 ETH/mo', '0.05 ETH/mo', '0.02 ETH/mo'])

console.log(failures === 0 ? '\n✅ streaming read transform verified' : `\n❌ ${failures} check(s) failed`)
if (failures > 0) process.exit(1)
