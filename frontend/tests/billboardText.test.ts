import assert from 'node:assert/strict'
import test from 'node:test'
import { billboardLine } from '../lib/github/billboardText'

const LS = String.fromCharCode(0x2028)
const NEL = String.fromCharCode(0x85)

test('a message can never start a new markdown line', () => {
  const text = `hi\n` + '```' + `\n[New installer](https://example.com/x)\r\n` + '```' + `${LS}# heading${NEL}x`
  const line = billboardLine(text)
  assert.equal(/[\r\n]/.test(line) || line.includes(LS) || line.includes(NEL), false)
  assert.equal(line, 'hi ``` [New installer](https://example.com/x) ``` # heading x')
})

test('control characters are removed and plain text is untouched', () => {
  assert.equal(billboardLine(`a${String.fromCharCode(0)}b${String.fromCharCode(27)}c${String.fromCharCode(127)}`), 'abc')
  assert.equal(billboardLine('Show the world 🌍 你好'), 'Show the world 🌍 你好')
})
