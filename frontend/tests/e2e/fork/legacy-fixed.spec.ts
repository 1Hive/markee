import { test, expect, type Page } from '@playwright/test'
import { TX_TIMEOUT, isolateChain, revertNextTx } from './support'

// The homepage's fixed-price signs (FixedPriceStrategy, read over RPC): changing one's message.
isolateChain()

async function openSign(page: Page) {
  await page.goto('/')
  await page.locator('.reader-card', { hasText: 'ETH to change' }).first().click()
  await page.getByPlaceholder('Your message here...').fill('e2e fixed price')
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
}

test('a reverted message change shows an error', async ({ page }) => {
  await openSign(page)
  await revertNextTx(() => page.getByRole('button', { name: 'Confirm Payment' }).click())
  await expect(page.getByText('Transaction failed on-chain. Please try again.')).toBeVisible({ timeout: TX_TIMEOUT })
})

test('change a fixed-price sign', async ({ page }) => {
  await openSign(page)
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Success! Message updated')).toBeVisible({ timeout: TX_TIMEOUT })
})
