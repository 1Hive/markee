import { test, expect } from '@playwright/test'
import { TX_TIMEOUT, isolateChain } from './support'

// The Buyer Hub's Stream Balance card: wrapping ETH into ETHx and back, inline.
isolateChain()

async function openStreamBalance(page: import('@playwright/test').Page) {
  await page.goto('/account?section=buyer')
  await expect(page.getByText('Runs Out In')).toBeVisible({ timeout: TX_TIMEOUT })
}

test('deposit ETH as ETHx', async ({ page }) => {
  await openStreamBalance(page)
  await page.getByRole('button', { name: 'Deposit', exact: true }).click()
  await page.getByPlaceholder('Amount to deposit').fill('0.01')
  await page.getByRole('button', { name: 'Deposit', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Deposited 0.01 ETH' })).toBeVisible({ timeout: TX_TIMEOUT })
})

test('withdraw ETHx back to ETH', async ({ page }) => {
  await openStreamBalance(page)
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click()
  await page.getByPlaceholder(/^Up to /).fill('0.005')
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Withdrew 0.005 ETH' })).toBeVisible({ timeout: TX_TIMEOUT })
})
