import assert from 'node:assert/strict'
import test from 'node:test'
import { readListing, listingReaderDeps, LISTING_ROUTES } from '../lib/leaderboards/listing-reader'

test('strategy totals reuse all shared listing snapshots without self HTTP or loaders', async t => {
  const keys: string[] = []
  t.mock.method(listingReaderDeps, 'get', async (key: string) => {
    keys.push(key)
    return { freshUntil: Date.now() + 60000, staleUntil: Date.now() + 60000, data: { leaderboards: [{ address: key }] } }
  })
  t.mock.method(listingReaderDeps, 'load', async () => { throw new Error('Cached lists must not load') })
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not self-fetch') })
  const lists = await Promise.all(LISTING_ROUTES.map(readListing))
  assert.equal(lists.length, 5)
  assert.deepEqual(keys, LISTING_ROUTES.map(route => `sdk:snapshots:v1:listings:cache:${route}:leaderboards`))
})

test('cold or expired listings use their shared loader and never turn failure into empty totals', async t => {
  let loaded = 0
  t.mock.method(listingReaderDeps, 'get', async () => ({ freshUntil: 0, staleUntil: Date.now() + 60000, data: { leaderboards: [] } }))
  t.mock.method(listingReaderDeps, 'load', async () => { loaded++; return Response.json({ leaderboards: [{ address: 'board' }] }) })
  assert.deepEqual(await readListing('forsale'), { leaderboards: [{ address: 'board' }] })
  assert.equal(loaded, 1)
  t.mock.method(listingReaderDeps, 'load', async () => Response.json({ error: 'Unavailable' }, { status: 503 }))
  await assert.rejects(readListing('forsale'), /Listing unavailable/)
})
