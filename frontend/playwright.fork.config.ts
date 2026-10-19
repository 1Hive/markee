import { defineConfig, devices } from '@playwright/test'
import { ANVIL, APP_PORT, FORK_BLOCK, FORK_RPC, KV, KV_TOKEN } from './tests/e2e/fork/env'

// End-to-end tests against a local fork of Base: real contracts, a mock wallet that never asks
// anyone to sign (Anvil signs for its unlocked test account), and local Redis in place of Vercel KV.
// See tests/e2e/fork/README.md.

if (!FORK_RPC) throw new Error('Set E2E_FORK_RPC_URL or ALCHEMY_BASE_URL in .env.local: Anvil needs a Base RPC to fork from.')

export default defineConfig({
  testDir: './tests/e2e/fork',
  globalSetup: './tests/e2e/fork/global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: `anvil --fork-url ${FORK_RPC} --fork-block-number ${FORK_BLOCK} --port 8545 --silent`,
      port: 8545,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'docker compose -f tests/e2e/fork/docker-compose.yml up --force-recreate',
      port: 8079,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        NEXT_PUBLIC_E2E: '1',
        NEXT_DIST_DIR: '.next-e2e',
        PORT: String(APP_PORT),
        NEXT_PUBLIC_BASE_RPC_URL: ANVIL,
        ALCHEMY_BASE_URL: ANVIL,
        KV_REST_API_URL: KV,
        KV_REST_API_TOKEN: KV_TOKEN,
        NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
      },
    },
  ],
})
