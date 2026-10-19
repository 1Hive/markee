import { test, expect } from '@playwright/test'

// Anvil's first default account, the mock wallet's address (see stubs/privy-wagmi.tsx).
const ACCOUNT_SHORT = '0xf39F…2266'

test('dashboard opens connected to the mock wallet on the fork', async ({ page }) => {
  await page.goto('/account?section=buyer')
  await expect(page.getByRole('heading', { name: 'My Dashboard' })).toBeVisible()
  await expect(page.getByText(ACCOUNT_SHORT).first()).toBeVisible()
  // Stream Balance reads /api/streaming/deposit-manager (fork RPC + local KV): its Runs Out In
  // value only renders once that call has succeeded.
  await expect(page.getByText('Runs Out In')).toBeVisible()
  await expect(page.getByText(/Not streaming|\d+h \d+m \d+s/).first()).toBeVisible()
})
