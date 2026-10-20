import { test, expect } from '@playwright/test'
import { BOARDS, TX_TIMEOUT, buySale, isolateChain, messageRow, openBuyModal, openBuyerHub } from './support'

// Sale board buyer flows beyond the first purchase: adding funds to your message and editing it.
isolateChain()

const MESSAGE = 'e2e sale add funds'
const EDITED = 'e2e sale edited inline'

test('buy a message to work with', async ({ page }) => {
  await buySale(page, BOARDS.saleSmall, MESSAGE)
})

test('add funds to your own message', async ({ page }) => {
  await openBuyModal(page, BOARDS.saleSmall)
  // The purchase above bid enough to win, so ours is the first row.
  await expect(page.getByText(MESSAGE).first()).toBeVisible()
  await page.getByRole('button', { name: '+ Fund' }).first().click()
  await expect(page.getByText('ADD FUNDS', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Success! Funds added to the sign')).toBeVisible({ timeout: TX_TIMEOUT })
})

test('edit the message inline in the Buyer Hub', async ({ page }) => {
  await openBuyerHub(page)
  const row = messageRow(page, MESSAGE)
  await row.hover()
  await row.getByRole('button', { name: 'Edit' }).click()
  // Once editing, the message lives in the input, so the row no longer matches by its text.
  const input = page.locator('.acct-row input')
  await input.fill(EDITED)
  await input.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Message updated' })).toBeVisible({ timeout: TX_TIMEOUT })
  await expect(messageRow(page, EDITED)).toBeVisible({ timeout: TX_TIMEOUT })
})
