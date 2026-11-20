import { test, expect, type Page } from '@playwright/test'
import type { Campaign1HiveSign } from '../../../lib/campaigns/1hive'

// The /1hive "Signs earning bonuses" table and its route. The fork's pinned block predates the v1.4
// factories, so no real board qualifies here; the table's states are driven through a stubbed route,
// and the real route is checked for its caching contract.

const sign = (address: string, site: string, views: number): Campaign1HiveSign => ({
  address, site, strategy: 'fixed', topMessage: null, topMarkeeAddress: null, views,
  topRateRaw: '0', topBidRaw: '1000000000000000', totalFundsRaw: '1000000000000000', streamedRateRaw: '0', streamedAt: 0,
})
const SIGNS = [
  sign('0x00000000000000000000000000000000000e2e01', 'busy.example.org', 250),
  sign('0x00000000000000000000000000000000000e2e02', 'quiet.example.org', 40),
]

function stubCampaign(page: Page, respond: (call: number) => { status: number; body?: unknown }) {
  let calls = 0
  return page.route('**/api/campaigns/1hive', route => {
    const { status, body } = respond(++calls)
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? { error: 'Campaign leaderboard unavailable' }) })
  }).then(() => () => calls)
}

const table = (page: Page) => page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Views' }) })

test('the 1Hive route answers without a server error and ignores ?bust=1', async ({ request }) => {
  const plain = await request.get('/api/campaigns/1hive')
  const busted = await request.get('/api/campaigns/1hive?bust=1')
  // 503 when the upstream reads fail (e.g. the For Rent factory read on an old fork), never a 500.
  expect([200, 503]).toContain(plain.status())
  expect(busted.status()).toBe(plain.status())
  if (plain.status() === 200) {
    const body = await plain.json()
    expect(Array.isArray(body.leaderboards)).toBe(true)
    // ?bust=1 is dropped, so both come from the same snapshot.
    expect(await busted.json()).toEqual(body)
  }
})

test('a failed load retries twice, then offers Try again, which loads the signs', async ({ page }) => {
  const calls = await stubCampaign(page, n => n <= 3 ? { status: 503 } : { status: 200, body: { leaderboards: SIGNS, ethPriceUsd: 3000 } })
  await page.goto('/1hive')

  // The first attempt and both automatic retries (2 s, 5 s) fail.
  const alert = page.getByRole('alert').filter({ hasText: "Couldn't load the leaderboard." })
  await expect(alert).toBeVisible({ timeout: 20_000 })
  expect(calls()).toBe(3)
  await expect(page.getByText('No signs earning yet')).toHaveCount(0)

  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(alert).toHaveCount(0)
  const rows = table(page).locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('busy.example.org')
  await expect(rows.nth(0)).toContainText('250')
  await expect(rows.nth(0)).not.toContainText('Needs 100+ views')
  await expect(rows.nth(0).getByRole('link', { name: 'busy.example.org' })).toHaveAttribute('href', `/markee/${SIGNS[0].address}`)
  // Under the 100-view minimum: listed, but flagged as not funded yet.
  await expect(rows.nth(1)).toContainText('quiet.example.org')
  await expect(rows.nth(1)).toContainText('Needs 100+ views')
  await expect(rows.nth(1)).toContainText('No message yet')
})

test('a load that recovers on an automatic retry never shows the error', async ({ page }) => {
  const calls = await stubCampaign(page, n => n === 1 ? { status: 503 } : { status: 200, body: { leaderboards: SIGNS.slice(0, 1), ethPriceUsd: 3000 } })
  await page.goto('/1hive')
  await expect(table(page).locator('tbody tr')).toHaveCount(1, { timeout: 10_000 })
  expect(calls()).toBe(2)
  await expect(page.getByRole('alert').filter({ hasText: "Couldn't load the leaderboard." })).toHaveCount(0)
})

test('no eligible signs is an empty state, not an error', async ({ page }) => {
  await stubCampaign(page, () => ({ status: 200, body: { leaderboards: [], ethPriceUsd: 3000 } }))
  await page.goto('/1hive')
  await expect(page.getByText('No signs earning yet. Yours could be first.')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: "Couldn't load the leaderboard." })).toHaveCount(0)
})
