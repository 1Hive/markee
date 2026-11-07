// Sites are listed and counted once per domain (views are recorded per hostname).
import test from 'node:test'
import assert from 'node:assert/strict'
import { onePerDomain, urlIntegrationKey } from '../lib/integrations/featured'
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
