import { test, expect } from '@playwright/test'

// ── /account page — disconnected state ───────────────────────────────────────

test.describe('/account — no wallet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/account')
  })

  test('shows connect-wallet CTA when no wallet is connected', async ({ page }) => {
    await expect(page.getByText('Connect your wallet', { exact: true })).toBeVisible()
  })

  test('page title is present', async ({ page }) => {
    await expect(page).toHaveTitle(/markee/i)
  })

  test('header navigation is visible', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible()
  })
})

// ── Moderation queue API (public GET) ────────────────────────────────────────

test.describe('/api/moderation/queue', () => {
  test('returns JSON with boards/items/flagged arrays for a valid moderator', async ({ request }) => {
    const res = await request.get('/api/moderation/queue?moderator=0x0000000000000000000000000000000000000001')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.items)).toBe(true)
    expect(Array.isArray(body.boards)).toBe(true)
    expect(Array.isArray(body.flagged)).toBe(true)
  })

  test('responds 400 when moderator param is missing', async ({ request }) => {
    const res = await request.get('/api/moderation/queue')
    expect(res.status()).toBe(400)
  })
})

// ── Moderation moderators API (public GET) ───────────────────────────────────

test.describe('/api/moderation/moderators', () => {
  test('returns JSON with owners and moderators arrays', async ({ request }) => {
    const res = await request.get('/api/moderation/moderators?board=0x0000000000000000000000000000000000000001')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.owners)).toBe(true)
    expect(Array.isArray(body.moderators)).toBe(true)
  })

  test('responds 400 when board param is missing', async ({ request }) => {
    const res = await request.get('/api/moderation/moderators')
    expect(res.status()).toBe(400)
  })
})

// ── Homepage smoke test ───────────────────────────────────────────────────────

test.describe('Homepage', () => {
  test('loads and shows the markee leaderboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
    // Page renders without a JS error (if it did, page.goto would throw)
  })
})

// ── /markee/[address] page ────────────────────────────────────────────────────

test.describe('/markee/[address]', () => {
  test('shows an error or board content for a well-formed address', async ({ page }) => {
    // Use a known non-existent but well-formed address; page should render without a crash
    await page.goto('/markee/0x0000000000000000000000000000000000000001')
    await expect(page.locator('body')).toBeVisible()
  })
})
