import { test, expect } from '@playwright/test'
import { MARKEE_TOKEN } from '../../../lib/contracts/addresses'
import { E2E_ACCOUNT, TX_TIMEOUT, isolateChain, rpc } from './support'

// Buying MARKEE from the Revnet terminal through the widget on /owners.
isolateChain()

async function markeeBalance() {
  const data = '0x70a08231' + E2E_ACCOUNT.slice(2).toLowerCase().padStart(64, '0') // balanceOf(address)
  return BigInt(await rpc<string>('eth_call', [{ to: MARKEE_TOKEN, data }, 'latest']))
}

test('buy MARKEE with ETH', async ({ page }) => {
  const before = await markeeBalance()
  await page.goto('/owners')
  await page.getByLabel('ETH amount').fill('0.01')
  await page.getByRole('button', { name: '+ Add a message' }).click()
  await page.getByPlaceholder('Optional, displayed publicly on Revnets').fill('e2e token buy')
  await page.getByRole('button', { name: 'Buy MARKEE' }).click()
  await expect(page.getByText('✓ Success!')).toBeVisible({ timeout: TX_TIMEOUT })
  expect(await markeeBalance()).toBeGreaterThan(before)
})
