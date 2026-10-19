import { readFileSync } from 'fs'

// Shared by playwright.fork.config.ts and global-setup.ts so both fork the same chain state.

function envFromFile(file: string): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(file, 'utf8').split('\n')
      .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map(m => [m[1], m[2].replace(/^['"]|['"]$/g, '')]))
  } catch { return {} }
}

const local = envFromFile('.env.local')

export const FORK_RPC = process.env.E2E_FORK_RPC_URL ?? local.ALCHEMY_BASE_URL ?? local.NEXT_PUBLIC_BASE_RPC_URL
// Pinned so every run starts from the same chain state (and Anvil can reuse its fork cache).
export const FORK_BLOCK = Number(process.env.E2E_FORK_BLOCK ?? 52_820_000)
export const ANVIL = 'http://127.0.0.1:8545'
export const KV = 'http://127.0.0.1:8079'
export const KV_TOKEN = 'e2e'
export const APP_PORT = 3100
