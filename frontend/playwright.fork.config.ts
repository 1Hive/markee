import { defineConfig, devices } from '@playwright/test'
import { ANVIL, APP_PORT, E2E_ACCOUNT, E2E_KEEPER_KEY, E2E_MNEMONIC, FORK_BLOCK, FORK_RPC, KV, KV_TOKEN } from './tests/e2e/fork/env'

// End-to-end tests against a local fork of Base: real contracts, a mock wallet that never asks
// anyone to sign (Anvil signs for its unlocked test account), and local Redis in place of Vercel KV.
// See tests/e2e/fork/README.md.

if (!FORK_RPC) throw new Error('Set E2E_FORK_RPC_URL or ALCHEMY_BASE_URL in .env.local: Anvil needs a Base RPC to fork from.')

export default defineConfig({
  globalSetup: './tests/e2e/fork/global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  // One retry in CI absorbs a slow upstream RPC on a cold fork; locally a failure should be loud.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  projects: [
    { name: 'fork', testDir: './tests/e2e/fork' },
    // The read-only checks that also run against staging, here against the local server with the
    // mock wallet switched off (see AutoConnect in stubs/privy-wagmi.tsx).
    {
      name: 'signed-out',
      testDir: './tests/e2e',
      testMatch: 'account.spec.ts',
      use: {
        storageState: {
          cookies: [{ name: 'e2e-wallet', value: 'off', domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
          origins: [],
        },
      },
    },
  ],
  webServer: [
    {
      command: `anvil --fork-url ${FORK_RPC} --fork-block-number ${FORK_BLOCK} --mnemonic "${E2E_MNEMONIC}" --port 8545 --silent`,
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
        NEXT_PUBLIC_E2E_ACCOUNT: E2E_ACCOUNT,
        NEXT_DIST_DIR: '.next-e2e',
        // Lets the specs trigger cron routes (streaming keeper) themselves.
        CRON_SECRET: 'e2e',
        KEEPER_PRIVATE_KEY: E2E_KEEPER_KEY,
        PORT: String(APP_PORT),
        NEXT_PUBLIC_BASE_RPC_URL: ANVIL,
        ALCHEMY_BASE_URL: ANVIL,
        KV_REST_API_URL: KV,
        KV_REST_API_TOKEN: KV_TOKEN,
        NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
        // Public factory address; locally it also comes from .env.local.
        NEXT_PUBLIC_STREAMING_FACTORY: process.env.NEXT_PUBLIC_STREAMING_FACTORY ?? '0x37f420fdE5c98e611EB7cb9b74ef579D84697039',
      },
    },
  ],
})
