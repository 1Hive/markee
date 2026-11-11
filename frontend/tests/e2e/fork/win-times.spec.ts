import { test, expect, type Page } from '@playwright/test'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { decodeFunctionResult, encodeFunctionData, formatEther, parseAbi, parseEther } from 'viem'
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

async function clearListingCaches() {
  // The shared listing cache moved into the SDK snapshot namespace. Preserve
  // board:tophistory:* while removing both legacy and current listing snapshots.
  const keys = [
    ...await kv<string[]>(['KEYS', 'cache:*']),
    ...await kv<string[]>(['KEYS', 'sdk:snapshots:v1:listings:*']),
  ]
  if (keys.length) await kv(['DEL', ...keys])
}

async function buyWinningSale(page: Page, message: string) {
  // These tests require #1; the modal's minimum/default bid need not beat the winner.
  // Read the fork rather than using live indexed prices for this historical chain.
  const abi = parseAbi(['function getTopMarkees(uint256) view returns (address[], uint256[])'])
  const data = await rpc<`0x${string}`>('eth_call', [{ to: BOARDS.sale, data: encodeFunctionData({ abi, functionName: 'getTopMarkees', args: [1n] }) }, 'latest'])
  const [, totals] = decodeFunctionResult({ abi, functionName: 'getTopMarkees', data })
  await buySale(page, BOARDS.sale, message, formatEther((totals[0] ?? 0n) + parseEther('0.001')))
  const result = await rpc<`0x${string}`>('eth_call', [{ to: BOARDS.sale, data: encodeFunctionData({ abi, functionName: 'getTopMarkees', args: [1n] }) }, 'latest'])
  const [[winner]] = decodeFunctionResult({ abi, functionName: 'getTopMarkees', data: result })
  const messageAbi = parseAbi(['function message() view returns (string)'])
  const text = await rpc<`0x${string}`>('eth_call', [{ to: winner, data: encodeFunctionData({ abi: messageAbi, functionName: 'message' }) }, 'latest'])
  expect(decodeFunctionResult({ abi: messageAbi, functionName: 'message', data: text })).toBe(message)
}

async function advanceHistory() {
  // Past the reorg margin the history stays behind the head by.
  await rpc('anvil_mine', ['0x80'])
  const { stdout } = await run('npx', ['tsx', 'tests/e2e/fork/advance-history.ts', `sale:${BOARDS.sale}`], { timeout: TX_TIMEOUT })
  process.stdout.write(stdout)
}

// Like openBuyerHub, but clears only the cached listings: a full flushKV would also drop the history.
async function openHubWithHistory(page: Page) {
  await advanceHistory()
  await clearListingCaches()
  await page.goto('/account?section=buyer')
  await expect(page.locator('.acct-row').first()).toBeVisible({ timeout: TX_TIMEOUT })
}

// The board's history from before these tests: a one-off backfill, done here so it isn't on a test's clock.
test.beforeAll(async () => {
  test.setTimeout(2 * TX_TIMEOUT)
  await advanceHistory()
})

test('a winning message shows how long it has been winning', async ({ page }) => {
  await buyWinningSale(page, 'e2e win first')
  await openHubWithHistory(page)
  await expect(messageRow(page, 'e2e win first')).toContainText(WINNING_FOR, { timeout: TX_TIMEOUT })
})

test('once outbid, it shows its total time won', async ({ page }) => {
  await rpc('evm_increaseTime', [2 * 3600])
  // Fresh listings, so the buy modal's default amount clears the first message rather than tying it.
  await clearListingCaches()
  await buyWinningSale(page, 'e2e win second')
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
  await clearListingCaches()

  // Refresh the public listing before mounting the hub. Its account and Best
  // Buys requests otherwise race a cold ecosystem read immediately after a
  // chain revert/cache reset, and the UI fetches Best Buys only once on mount.
  // bust=1 skips the ecosystem KV cache and propagates a forced refresh to
  // each platform's shared listing snapshot cache; it is not a CDN cache key.
  const listing = await page.request.get('/api/ecosystem/leaderboards?bust=1')
  expect(listing.ok()).toBeTruthy()
  expect((await listing.json()).leaderboards.some((lb: { address: string }) =>
    lb.address.toLowerCase() === BOARDS.sale.toLowerCase())).toBe(true)
  // Best Buys reads the listing without bust. Right after a refresh, a platform's snapshot can still be
  // locked or backing off, and that read then comes back without the platform's boards (Best Buys returns
  // an uncached empty list, and the next load recovers). Retry until the listing settles.
  // Each poll also logs what the unbusted listing held when Best Buys is empty, so a timeout says why.
  await expect.poll(async () => {
    await kv(['DEL', 'cache:marketplace:best-buys'])
    const plain = await page.request.get('/api/ecosystem/leaderboards')
    const board = plain.ok()
      ? ((await plain.json()).leaderboards as { address: string }[]).find(lb => lb.address.toLowerCase() === BOARDS.sale.toLowerCase())
      : undefined
    const bestBuys = await page.request.get('/api/marketplace/best-buys')
    const body = bestBuys.ok() ? await bestBuys.json() : { buys: [] }
    if (!body.buys?.length) {
      console.log(`[best-buys poll] best-buys HTTP ${bestBuys.status()} ${JSON.stringify(body).slice(0, 200)}; listing HTTP ${plain.status()}; board ${board ? JSON.stringify(board).slice(0, 400) : 'missing'}`)
    }
    return body.buys
  }, { timeout: TX_TIMEOUT, intervals: [1_000, 2_000, 5_000] }).toEqual(expect.arrayContaining([
    expect.objectContaining({ address: expect.stringMatching(new RegExp(`^${BOARDS.sale}$`, 'i')), views: 5250 }),
  ]))

  await page.goto('/account?section=buyer')
  await expect(messageRow(page, 'e2e win second')).toContainText('5,250', { timeout: TX_TIMEOUT })
  const panel = page.locator('section', { hasText: 'Best Buys' })
  await expect(panel).toBeVisible({ timeout: TX_TIMEOUT })
  const row = panel.locator('a', { hasText: '5,250 views' })
  await expect(row).toHaveAttribute('href', new RegExp(`/markee/${BOARDS.sale}$`, 'i'))
  await expect(row).toContainText('CPM')
})
