import { test, expect } from '@playwright/test'
import { TX_TIMEOUT, isolateChain, kv } from './support'

// Settings → notification email and frequency, both saved with a signed message. No mail is sent
// (BREVO_API_KEY is unset), so the verification link is read back from KV.
isolateChain()

async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/account?section=settings')
  await expect(page.getByText('Frequency', { exact: true })).toBeVisible({ timeout: TX_TIMEOUT })
}

test('set a notification email and verify it', async ({ page }) => {
  await openSettings(page)
  await page.getByPlaceholder('name@example.com').fill('e2e@example.com')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved · verification email sent' })).toBeVisible({ timeout: TX_TIMEOUT })

  const [key] = await kv<string[]>(['KEYS', 'moderation:verify:*'])
  await page.goto(`/api/moderation/notify/verify?token=${key.split(':').pop()}`)
  await expect(page.getByText(/Email verified!/)).toBeVisible({ timeout: TX_TIMEOUT })
})

test('change the email frequency', async ({ page }) => {
  await openSettings(page)
  await page.getByRole('button', { name: 'Off', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Notification settings saved' })).toBeVisible({ timeout: TX_TIMEOUT })
})
