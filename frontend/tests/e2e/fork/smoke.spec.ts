import { test, expect } from '@playwright/test'
import { E2E_ACCOUNT } from './env'

// How the dashboard abbreviates the mock wallet's address.
const ACCOUNT_SHORT = `${E2E_ACCOUNT.slice(0, 6)}…${E2E_ACCOUNT.slice(-4)}`

test('dashboard opens connected to the mock wallet on the fork', async ({ page }) => {
  await page.goto('/account?section=buyer')
  await expect(page.getByRole('heading', { name: 'My Dashboard' })).toBeVisible()
  await expect(page.getByText(ACCOUNT_SHORT).first()).toBeVisible()
  // Stream Balance reads /api/streaming/deposit-manager (fork RPC + local KV): its Runs Out In
  // value only renders once that call has succeeded.
  await expect(page.getByText('Runs Out In')).toBeVisible()
  await expect(page.getByText(/Not streaming|\d+h \d+m \d+s/).first()).toBeVisible()
})
