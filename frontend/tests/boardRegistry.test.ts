import assert from 'node:assert/strict'
import test from 'node:test'
import { BOARD_FACTORIES, boardTrustFrom, minimalProxyCode } from '../lib/contracts/boardRegistry'

const ok = (result: boolean) => ({ status: 'success' as const, result })
const failed = { status: 'failure' as const }

test('a board is trusted when any known factory created it', () => {
  assert.equal(boardTrustFrom([ok(false), ok(true), failed]), 'trusted')
})

test('a board no factory recognizes is untrusted', () => {
  assert.equal(boardTrustFrom([ok(false), ok(false), ok(false)]), 'untrusted')
})

test('a failed read never counts as untrusted or trusted', () => {
  assert.equal(boardTrustFrom([ok(false), failed]), 'unavailable')
  assert.equal(boardTrustFrom(undefined), 'loading')
})

test('every v1.3, For Sale and streaming factory is checked', () => {
  for (const factory of ['0xC497187AAa35C26b0008B43C10A6F6300b7eBcad', '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c', '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2', '0x861D9897eC47421aAFB6321Ee219E88ab485121f', '0x37f420fdE5c98e611EB7cb9b74ef579D84697039']) {
    assert.ok(BOARD_FACTORIES.includes(factory.toLowerCase() as `0x${string}`), factory)
  }
})

test('every v1.4 factory is checked', () => {
  for (const factory of ['0xf504274DbB1054aABB055076C0052806be9A810b', '0xD7363FED82eD7fd6663243DFD7E2647d6BF02711', '0xf1cd0906820c42fC50b225D9adF9F6961C79Ca00', '0x048589C50bc1C6053cAC7B9d4463ddDc0973a06b']) {
    assert.ok(BOARD_FACTORIES.includes(factory.toLowerCase() as `0x${string}`), factory)
  }
})

test('minimal proxy code matches the board clone runtime', () => {
  assert.equal(
    minimalProxyCode('0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'),
    '0x363d3d373d3d3d363d73abcdef0123456789abcdef0123456789abcdef015af43d82803e903d91602b57fd5bf3',
  )
})
