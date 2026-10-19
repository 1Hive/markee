import { test, expect, type Page } from '@playwright/test'

// The three bids from manual testing, made through the real buy modals against the fork, then
// checked in the Buyer Hub's Your Messages table. Boards exist on Base at the pinned fork block.
const FOR_SALE_BOARD = '0xa52EB22029677029D4e609aD5e54ca6552c0B31F'
// Top message streams ~0.009 ETH/mo, so a minimum bid stays below it.
const RENT_BOARD = '0x0FDa48f1F0fC975d1Ed7eEb044936aBDe0239664'
// "Go with the Flow 🌊" wins here and belongs to someone else: we back it with a stream.
const RENT_BOARD_WITH_WINNER = '0x29f45F615f3104B31CE55fA7704b565Fe411Ce75'

const SALE_MESSAGE = 'e2e for sale message'
const RENT_MESSAGE = 'e2e rent below top'
const BACKED_MESSAGE = 'Go with the Flow'

// The first transaction on a fresh fork is slow: Anvil pulls every storage slot it touches from
// the upstream RPC. Later runs at the same block are warm (about 2s per transaction).
const TX_TIMEOUT = 150_000

async function openBuyModal(page: Page, board: string) {
  await page.goto(`/markee/${board}`)
  await page.getByRole('button', { name: 'Buy a New Message' }).click()
}

// Tests run in file order (workers: 1, not fully parallel): the three bids first, then the checks.
// Not serial mode: each Buyer Hub check should report on its own instead of skipping the rest.

test.describe('bids show up in the Buyer Hub', () => {
  test('buy a message on a For Sale board', async ({ page }) => {
    await openBuyModal(page, FOR_SALE_BOARD)
    await page.getByPlaceholder('Your message here... (222 max)').fill(SALE_MESSAGE)
    await page.getByRole('button', { name: 'Review Payment Info' }).click()
    await page.getByRole('button', { name: 'Confirm Payment' }).click()
    await expect(page.getByText('Success! Your message is live')).toBeVisible({ timeout: TX_TIMEOUT })
  })

  test('place a Rent bid below the current winner', async ({ page }) => {
    await openBuyModal(page, RENT_BOARD)
    await page.getByPlaceholder('Your message here... (222 max)').fill(RENT_MESSAGE)
    await page.getByRole('button', { name: 'MIN', exact: true }).click()
    // "Buy Message" with enough ETHx, "Deposit X ETH and Buy" when the deposit has to be topped up.
    await page.getByRole('button', { name: /^(Buy Message|Deposit .+ and Buy)$/ }).click()
    // Create message → approve deposit → deposit ETH & start stream, each auto-signed by Anvil.
    await expect(page.getByText('Success! Your message is live')).toBeVisible({ timeout: TX_TIMEOUT })
  })

  test("stream behind someone else's winning message", async ({ page }) => {
    await openBuyModal(page, RENT_BOARD_WITH_WINNER)
    await page.getByRole('button', { name: '+ Fund' }).first().click()
    await expect(page.getByText('Fund Message', { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Review Payment Info' }).click()
    await page.getByRole('button', { name: 'Confirm Payment' }).click()
    await expect(page.getByText('Success! Funds added to the sign')).toBeVisible({ timeout: TX_TIMEOUT })
  })

  test.describe('Your Messages', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/account?section=buyer')
      await expect(page.getByText('Your Messages', { exact: false }).first()).toBeVisible()
      // The first load after the bids hits cold listing routes on the fork (RPC log scans, KV
      // cache misses), which can take longer than a normal assertion timeout.
      await expect(page.locator('.acct-row').first()).toBeVisible({ timeout: TX_TIMEOUT })
    })

    test('lists the For Sale purchase', async ({ page }) => {
      await expect(page.getByText(SALE_MESSAGE)).toBeVisible()
    })

    test('lists the Rent bid as outbid', async ({ page }) => {
      const row = page.locator('.acct-row', { hasText: RENT_MESSAGE })
      await expect(row).toBeVisible()
      await expect(row.getByText(/Outbid/)).toBeVisible()
    })

    test('lists the backed Rent message as Funded and winning', async ({ page }) => {
      const row = page.locator('.acct-row', { hasText: BACKED_MESSAGE })
      await expect(row).toBeVisible()
      await expect(row.getByText('Funded')).toBeVisible()
      await expect(row.getByText('Winning')).toBeVisible()
    })
  })
})
