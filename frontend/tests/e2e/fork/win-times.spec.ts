import { test, expect, type Page } from '@playwright/test'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem'
import { BOARDS, TX_TIMEOUT, buySale, isolateChain, kv, messageRow, rpc } from './support'

// How long a message has been winning, and its total time at #1 (the board's #1 history), plus how
// board views are counted (lib/views/boards.ts) on the dashboard and in Best Buys. The moderation scan advances the history every 5 minutes in production; here the
// spec runs the same update against the fork so it doesn't wait on a 10-minute cold scan.
isolateChain()
test.setTimeout(2 * TX_TIMEOUT)

const run = promisify(execFile)
// The page counts "winning for" up to the browser's clock, which runs ahead of the fork's block times,
// so only its shape is checked; total time won is all chain time and is checked exactly.
const WINNING_FOR = /Winning\s*for \d+[dhm]/

async function advanceHistory() {
  // Past the reorg margin the history stays behind the head by.
  await rpc('anvil_mine', ['0x80'])
  const { stdout } = await run('npx', ['tsx', 'tests/e2e/fork/advance-history.ts', `sale:${BOARDS.sale}`], { timeout: TX_TIMEOUT })
  process.stdout.write(stdout)
}

// Like openBuyerHub, but clears only the cached listings: a full flushKV would also drop the history.
async function openHubWithHistory(page: Page) {
  await advanceHistory()
  const caches = await kv<string[]>(['KEYS', 'cache:*'])
  if (caches.length) await kv(['DEL', ...caches])
  await page.goto('/account?section=buyer')
  await expect(page.locator('.acct-row').first()).toBeVisible({ timeout: TX_TIMEOUT })
}

// The board's history from before these tests: a one-off backfill, done here so it isn't on a test's clock.
test.beforeAll(async () => {
  test.setTimeout(2 * TX_TIMEOUT)
  await advanceHistory()
})

test('a winning message shows how long it has been winning', async ({ page }) => {
  await buySale(page, BOARDS.sale, 'e2e win first')
  await openHubWithHistory(page)
  await expect(messageRow(page, 'e2e win first')).toContainText(WINNING_FOR, { timeout: TX_TIMEOUT })
})

test('once outbid, it shows its total time won', async ({ page }) => {
  await rpc('evm_increaseTime', [2 * 3600])
  // Fresh listings, so the buy modal's default amount clears the first message rather than tying it.
  const caches = await kv<string[]>(['KEYS', 'cache:*'])
  if (caches.length) await kv(['DEL', ...caches])
  await buySale(page, BOARDS.sale, 'e2e win second')
  await openHubWithHistory(page)
  await expect(messageRow(page, 'e2e win first')).toContainText(/Won for 2h \d+m total/, { timeout: TX_TIMEOUT })
  await expect(messageRow(page, 'e2e win second')).toContainText(WINNING_FOR)
})

test('views count the board and its top message, on the dashboard and in Best Buys', async ({ page }) => {
  // Best Buys only lists boards that are on a site, like the marketplace.
  await kv(['SET', `oi:meta:${BOARDS.sale.toLowerCase()}`, JSON.stringify({ verifiedUrls: ['https://example.com'], verifiedUrl: 'https://example.com', status: 'verified' })])
  const abi = parseAbi(['function getTopMarkees(uint256) view returns (address[], uint256[])'])
  const data = await rpc<`0x${string}`>('eth_call', [{ to: BOARDS.sale, data: encodeFunctionData({ abi, functionName: 'getTopMarkees', args: [1n] }) }, 'latest'])
  const [[top]] = decodeFunctionResult({ abi, functionName: 'getTopMarkees', data })
  await kv(['SET', `views:total:${BOARDS.sale.toLowerCase()}`, 5000])
  await kv(['SET', `views:total:${top.toLowerCase()}`, 250])
  const caches = await kv<string[]>(['KEYS', 'cache:*'])
  if (caches.length) await kv(['DEL', ...caches])

  await page.goto('/account?section=buyer')
  await expect(messageRow(page, 'e2e win second')).toContainText('5,250', { timeout: TX_TIMEOUT })
  const panel = page.locator('section', { hasText: 'Best Buys' })
  await expect(panel).toBeVisible({ timeout: TX_TIMEOUT })
  const row = panel.locator('a', { hasText: '5,250 views' })
  await expect(row).toHaveAttribute('href', new RegExp(`/markee/${BOARDS.sale}$`, 'i'))
  await expect(row).toContainText('CPM')
})
