import assert from 'node:assert/strict'
import test from 'node:test'
import { textLimitError, truncateUtf8, utf8Length } from '../lib/leaderboard/textBytes'

test('counts UTF-8 bytes the way the contracts do', () => {
  assert.equal(utf8Length('hello'), 5)
  assert.equal(utf8Length('é'), 2)
  assert.equal(utf8Length('あ'.repeat(120)), 360)
  assert.equal(utf8Length('😀'), 4)
  assert.equal(utf8Length(''), 0)
})

test('truncates on code point boundaries without splitting surrogate pairs', () => {
  assert.equal(truncateUtf8('hello', 3), 'hel')
  assert.equal(truncateUtf8('あいう', 7), 'あい')
  assert.equal(truncateUtf8('a😀b', 4), 'a')
  assert.equal(truncateUtf8('a😀b', 5), 'a😀')
  assert.equal(utf8Length(truncateUtf8('😀'.repeat(22), 22)), 20)
  assert.equal(truncateUtf8('short', 222), 'short')
})

test('reports a byte limit error only past the limit', () => {
  assert.equal(textLimitError('Message', 'a'.repeat(222), 222), null)
  assert.ok(textLimitError('Message', 'あ'.repeat(75), 222))
  assert.ok(textLimitError('Name', 'a'.repeat(23), 22))
})
