import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeBoostsAt,
  addWeightedDeltas,
  calculateNetDeltas,
  deserializeSnapshot,
  pointTargets,
  serializeSnapshot,
  snapshotKey,
  type BoostConfigVersion,
  type CampaignSnapshot,
} from '../lib/superfluid/streamingCampaign'

const account = '0x1111111111111111111111111111111111111111'
const otherAccount = '0x2222222222222222222222222222222222222222'
const board = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const boostedBoard = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function snapshot(values: Array<[string, string, bigint, bigint]>): CampaignSnapshot {
  return new Map(values.map(([owner, receiver, gross, refunded]) => [
    snapshotKey(owner, receiver),
    { gross, refunded },
  ]))
}

test('calculates campaign-window net ETHx per account and leaderboard', () => {
  const previous = snapshot([[account, board, 10n, 3n]])
  const current = snapshot([[account, board, 40n, 11n]])

  assert.deepEqual(calculateNetDeltas(previous, current), new Map([
    [snapshotKey(account, board), 22n],
  ]))
})

test('a refund equal to the streamed amount awards no points', () => {
  const deltas = calculateNetDeltas(
    new Map(),
    snapshot([[account, board, 10n ** 18n, 10n ** 18n]]),
  )

  assert.equal(deltas.size, 0)
})

test('returns a negative correction when a delayed refund exceeds new streaming', () => {
  assert.deepEqual(
    calculateNetDeltas(
      snapshot([[account, board, 10n, 2n]]),
      snapshot([[account, board, 12n, 5n]]),
    ),
    new Map([[snapshotKey(account, board), -1n]]),
  )
})

test('fails closed when cumulative refunds exceed cumulative gross streaming', () => {
  assert.throws(
    () => calculateNetDeltas(
      snapshot([[account, board, 10n, 2n]]),
      snapshot([[account, board, 12n, 13n]]),
    ),
    /Cumulative refunds exceeded gross stream value/,
  )
})

test('applies prospective per-board multipliers and floors only cumulative points', () => {
  let numerators = addWeightedDeltas(
    {},
    new Map([
      [snapshotKey(account, board), 50_000_000_000n],
      [snapshotKey(account, boostedBoard), 50_000_000_000n],
      [snapshotKey(otherAccount, board), 100_000_000_000n],
    ]),
    { [boostedBoard]: 3 },
    10_000_000n,
  )
  assert.deepEqual(pointTargets(numerators), { [account]: 2, [otherAccount]: 1 })

  numerators = addWeightedDeltas(
    numerators,
    new Map([[snapshotKey(account, board), 50_000_000_000n]]),
    {},
    10_000_000n,
  )
  assert.deepEqual(pointTargets(numerators), { [account]: 2, [otherAccount]: 1 })
})

test('a delayed refund lowers the cumulative point target', () => {
  let numerators = addWeightedDeltas(
    {},
    new Map([[snapshotKey(account, board), 10n ** 18n]]),
    {},
    10_000_000n,
  )
  assert.equal(pointTargets(numerators)[account], 10_000_000)

  numerators = addWeightedDeltas(
    numerators,
    new Map([[snapshotKey(account, board), -(4n * 10n ** 17n)]]),
    {},
    10_000_000n,
  )
  assert.equal(pointTargets(numerators)[account], 6_000_000)
})

test('selects the last boost version effective at a block boundary', () => {
  const history: BoostConfigVersion[] = [
    { effectiveBlock: 100, multipliers: { [board]: 2 }, updatedAt: 1, updatedBy: account },
    { effectiveBlock: 200, multipliers: { [boostedBoard]: 4 }, updatedAt: 2, updatedBy: account },
  ]

  assert.deepEqual(activeBoostsAt(history, 99), {})
  assert.deepEqual(activeBoostsAt(history, 100), { [board]: 2 })
  assert.deepEqual(activeBoostsAt(history, 199), { [board]: 2 })
  assert.deepEqual(activeBoostsAt(history, 200), { [boostedBoard]: 4 })
})

test('snapshot persistence round-trips bigint cumulative values', () => {
  const original = snapshot([[account, board, 1234567890123456789n, 987654321n]])
  assert.deepEqual(deserializeSnapshot(serializeSnapshot(original)), original)
})
