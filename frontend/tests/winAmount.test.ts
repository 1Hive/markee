import assert from 'node:assert/strict'
import test from 'node:test'
import { parseEther } from 'viem'
import { beatsTop, formatEthCeil, shortfallToWin, winAmountWei } from '../lib/leaderboard/winAmount'

test('the WIN amount is rounded up so the shown figure still takes #1', () => {
  const top = parseEther('0.274221')
  const win = winAmountWei(top)!
  assert.equal(win, parseEther('0.276'))
  assert.equal(formatEthCeil(win), '0.276')
  assert.ok(beatsTop(win, 0n, top))
  assert.ok(beatsTop(parseEther(formatEthCeil(win)), 0n, top))
})

test('WIN on board tops that previously rounded below the target', () => {
  for (const t of ['0.19002', '0.274221', '0.0101', '1.2345674']) {
    const top = parseEther(t)
    const win = winAmountWei(top)!
    assert.ok(beatsTop(parseEther(formatEthCeil(win)), 0n, top), t)
  }
})

test('WIN for adding funds accounts for the message total already in place', () => {
  const top = parseEther('0.5')
  const own = parseEther('0.3004')
  const win = winAmountWei(top, own)!
  assert.equal(win, parseEther('0.201'))
  assert.ok(beatsTop(win, own, top))
  assert.equal(winAmountWei(top, parseEther('0.6')), null)
  assert.equal(winAmountWei(0n), null)
})

test('winning needs strictly more than the current top', () => {
  const top = parseEther('0.274221')
  assert.equal(beatsTop(top, 0n, top), false)
  assert.equal(beatsTop(top + 1n, 0n, top), true)
  assert.equal(beatsTop(parseEther('0.275'), 0n, top), true)
})

test('shortfall is the exact top-up needed and is zero once the bid wins', () => {
  const top = parseEther('0.274221')
  assert.equal(shortfallToWin(parseEther('0.275'), 0n, top), 0n)
  assert.equal(shortfallToWin(parseEther('0.27'), 0n, top), parseEther('0.004221') + 1n)
  assert.equal(formatEthCeil(shortfallToWin(parseEther('0.274221'), 0n, top)), '0.001')
  assert.equal(shortfallToWin(0n, parseEther('0.3'), parseEther('0.2')), 0n)
})
