import { defineConfig, devices } from '@playwright/test'

// In CI, e2e runs against an already-deployed URL provided via BASE_URL.
// Locally, Playwright starts the dev server automatically.
const isCI = !!process.env.CI
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Only start a local dev server when not in CI — CI uses a live BASE_URL.
  webServer: isCI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
