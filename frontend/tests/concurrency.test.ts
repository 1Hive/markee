import assert from 'node:assert/strict'
import test from 'node:test'
import { mapSettled } from '../lib/concurrency'

test('mapSettled never runs more than the limit at once and keeps input order', async () => {
  let active = 0
  let peak = 0
  const results = await mapSettled([5, 1, 4, 2, 3, 0], 2, async n => {
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, n))
    active--
    return n * 10
  })
  assert.equal(peak, 2)
  assert.deepEqual(results.map(r => r.status === 'fulfilled' ? r.value : null), [50, 10, 40, 20, 30, 0])
})

test('mapSettled isolates a rejection to its own slot', async () => {
  const results = await mapSettled(['a', 'boom', 'c'], 4, async s => {
    if (s === 'boom') throw new Error(s)
    return s
  })
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled'])
})

test('mapSettled handles an empty list', async () => {
  assert.deepEqual(await mapSettled([], 4, async x => x), [])
})
