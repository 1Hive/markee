import { test, expect } from '@playwright/test'
import { BOARDS, TX_TIMEOUT, isolateChain, openBuyModal, revertNextTx } from './support'

// A transaction that the wallet sends but that reverts on-chain shows an error and gives the form
// back, instead of sitting on "Confirming" or quietly re-enabling the button.
isolateChain()

const FAILED = 'Transaction failed on-chain. Please try again.'

test('a reverted For Sale purchase shows an error', async ({ page }) => {
  await openBuyModal(page, BOARDS.sale)
  await page.getByPlaceholder(/^Your message here\.\.\. \(\d+ max\)$/).fill('e2e reverted buy')
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await revertNextTx(() => page.getByRole('button', { name: 'Confirm Payment' }).click())
  await expect(page.getByText(FAILED)).toBeVisible({ timeout: TX_TIMEOUT })
  await expect(page.getByText('Success! Your message is live')).toHaveCount(0)
})

test('a reverted ETHx deposit shows an error', async ({ page }) => {
  await page.goto('/account?section=buyer')
  await expect(page.getByText('Runs Out In')).toBeVisible({ timeout: TX_TIMEOUT })
  await page.getByRole('button', { name: 'Deposit', exact: true }).click()
  await page.getByPlaceholder('Amount to deposit').fill('0.01')
  await revertNextTx(() => page.getByRole('button', { name: 'Deposit', exact: true }).click())
  await expect(page.getByText(FAILED)).toBeVisible({ timeout: TX_TIMEOUT })
  await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeEnabled()
})
