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

test('shows a migrated board’s legacy stream with Stop as its only action', async ({ page }) => {
  // The fork is pinned before migration. Supply the post-migration API shape:
  // the successor has no stream, but the original still drains the buyer's balance.
  const oldBoardName = 'Migrated Rent Board'
  await page.route('**/api/streaming/deposit-manager?*', route => route.fulfill({
    json: {
      ethxBalanceRaw: '1000000000000000000',
      streams: [],
      deposits: [],
      legacyStreams: [{
        boardAddress: '0x0000000000000000000000000000000000000101',
        markeeAddress: '0x0000000000000000000000000000000000000102',
        boardName: oldBoardName,
        message: 'A stream left on the original',
        name: '',
        rank: 1,
        isTop: true,
        rateRaw: '10000000000',
        legacy: true,
      }],
    },
  }))

  await openStreamBalance(page)
  await expect(page.getByText('Streams on old boards', { exact: true })).toBeVisible()
  await expect(page.getByText('+ 1 old', { exact: true })).toBeVisible()
  const row = page.getByText(oldBoardName, { exact: true }).locator('../..')
  await expect(row.getByText('A stream left on the original')).toBeVisible()
  await expect(row.getByRole('button')).toHaveCount(1)
  const stop = row.getByRole('button', { name: 'Stop stream', exact: true })
  await expect(stop).toBeVisible()
  await expect(stop).toBeEnabled()
  // Intentionally leave the control untouched: this test never submits a transaction.
})
