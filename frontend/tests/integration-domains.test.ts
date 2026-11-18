// Sites are listed and counted once per domain (views are recorded per hostname).
import test from 'node:test'
import assert from 'node:assert/strict'
import { onePerDomain, pickFeatured, urlIntegrationKey, viewReporting, viewsUnavailable } from '../lib/integrations/featured'
import { verifiedOnSameDomain } from '../lib/integrations/verifiedSites'

test('one verified URL per domain, keeping the first page and the domain order', () => {
  const urls = ['https://frogandgoose.space/', 'https://frogandgoose.space/signin', 'https://www.example.com/a', 'https://example.com/b', 'https://other.org']
  assert.deepEqual(onePerDomain(urls), ['https://frogandgoose.space/', 'https://www.example.com/a', 'https://other.org'])
})

test('the featured page represents its domain', () => {
  const urls = ['https://frogandgoose.space/', 'https://frogandgoose.space/signin']
  assert.deepEqual(onePerDomain(urls, urlIntegrationKey('https://frogandgoose.space/signin')), ['https://frogandgoose.space/signin'])
  assert.deepEqual(onePerDomain(urls, 'f:owner/repo/README.md'), ['https://frogandgoose.space/'])
})

test('a URL on an already-verified domain is detected however it is typed', () => {
  const verified = ['https://frogandgoose.space/']
  for (const input of ['frogandgoose.space/signin', 'https://www.frogandgoose.space/about', 'HTTPS://FrogAndGoose.space']) {
    assert.equal(verifiedOnSameDomain(input, verified), 'https://frogandgoose.space/', input)
  }
  for (const input of ['', 'frog', 'frogandgoose.com', 'sub.example.com']) assert.equal(verifiedOnSameDomain(input, verified), null, input)
})

test('the featured integration is the owner pick, else the most viewed of those whose views were read', () => {
  const views = { 'f:a/b/README.md': 0, 'u:https://a.org': 5, 'u:https://b.org': 9 }
  assert.deepEqual(pickFeatured(views, 'u:https://a.org'), { featured: 'u:https://a.org', chosen: true })
  assert.deepEqual(pickFeatured(views, 'u:https://gone.org'), { featured: 'u:https://b.org', chosen: false })
  assert.deepEqual(pickFeatured(views, null), { featured: 'u:https://b.org', chosen: false })
  // An unreadable integration still can be the owner's pick, but never wins on its unknown 0.
  assert.deepEqual(pickFeatured({ 'f:a/b/README.md': 0, 'u:https://a.org': 0 }, null, ['f:a/b/README.md']), { featured: 'u:https://a.org', chosen: false })
  assert.deepEqual(pickFeatured(views, 'f:a/b/README.md', ['f:a/b/README.md']), { featured: 'f:a/b/README.md', chosen: true })
  // If nothing could be read, the first one is featured rather than none.
  assert.deepEqual(pickFeatured({ 'u:https://a.org': 0, 'u:https://b.org': 0 }, null, ['u:https://a.org', 'u:https://b.org']), { featured: 'u:https://a.org', chosen: false })
  assert.deepEqual(pickFeatured({}, null), { featured: null, chosen: false })
})

test("a site whose views couldn't be read is not reported as missing views", () => {
  const info = { featured: null, chosen: false, views: { 'u:https://a.org': 0, 'u:https://b.org': 0 }, lastView: { 'u:https://a.org': null, 'u:https://b.org': null }, unavailable: ['u:https://a.org'] }
  assert.equal(viewsUnavailable(info, 'u:https://a.org'), true)
  assert.equal(viewsUnavailable(info, 'u:https://b.org'), false)
  assert.equal(viewReporting(info, 'u:https://a.org'), 'ok')
  assert.equal(viewReporting(info, 'u:https://b.org'), 'none')
})
