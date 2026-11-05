import { test, expect } from '@playwright/test'
import { E2E_ACCOUNT, TX_TIMEOUT, isolateChain } from './support'

// Creating a For Rent board and activating it with the first streamed message.
isolateChain()

test('create a For Rent board and activate it', async ({ page }) => {
  await page.goto('/create-a-markee')
  await page.getByPlaceholder('My Project').fill('E2E Rent Board')
  await page.getByPlaceholder('0x... (receives ETH on Base Network)').fill(E2E_ACCOUNT)
  await page.getByText('For Rent', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Deploy Markee' }).click()
  await expect(page.getByText('Transaction confirmed')).toBeVisible({ timeout: TX_TIMEOUT })

  // Activate: the first message, streamed at the board minimum.
  await page.getByRole('button', { name: 'Activate Markee →' }).click()
  await page.getByPlaceholder(/Your message here/).fill('e2e first rent message')
  await page.getByRole('button', { name: 'MIN', exact: true }).click()
  await page.getByRole('button', { name: /Review Payment Info|Activate Markee/ }).last().click()
  const confirm = page.getByRole('button', { name: 'Confirm Payment' })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await expect(page.getByText('Success! Your Markee is Activated').first()).toBeVisible({ timeout: TX_TIMEOUT })
})
