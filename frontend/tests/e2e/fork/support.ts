import { test, expect, type Page } from '@playwright/test'
import { ANVIL, KV, KV_TOKEN } from './env'

export { E2E_ACCOUNT, E2E_OTHER } from './env'

// Boards that exist on Base at the pinned fork block (env.ts).
export const BOARDS = {
  // For Sale, top bid 0.003 ETH.
  sale: '0xa52EB22029677029D4e609aD5e54ca6552c0B31F',
  // For Sale, top bid 0.001 ETH.
  saleSmall: '0xc0148ade5d21f1C3183dACd4B9e6721df577f6B2',
  // Rent, top streams ~0.009 ETH/mo, so a minimum bid stays below it.
  rent: '0x0FDa48f1F0fC975d1Ed7eEb044936aBDe0239664',
  // Rent, two messages; the winner ("Go with the Flow 🌊") streams ~0.001 ETH/mo and isn't ours.
  rentWithWinner: '0x29f45F615f3104B31CE55fA7704b565Fe411Ce75',
  // Rent, top streams ~0.001 ETH/mo, so a WIN bid takes it.
  rentCheap: '0xb199beDC4af21aAfe0fCA725EAcAc2c149Bf3026',
} as const

// The first transaction on a cold fork is slow: Anvil pulls every storage slot it touches from the
// upstream RPC. Warm, a transaction takes about 2s.
export const TX_TIMEOUT = 150_000

export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(ANVIL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result as T
}

// One Redis command against the local KV (Upstash REST shape), e.g. kv(['GET', key]).
export async function kv<T = unknown>(command: unknown[]): Promise<T> {
  const res = await fetch(KV, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) })
  if (!res.ok) throw new Error(`KV ${command[0]}: HTTP ${res.status}`)
  return (await res.json()).result as T
}

// Clears everything the app keeps in KV except creator:* keys, which are fixed facts at the fork
// block that /api/superfluid/leaderboards otherwise rebuilds with a full-history getLogs.
export async function flushKV() {
  const keys = (await kv<string[]>(['KEYS', '*'])).filter(k => !k.startsWith('creator:'))
  for (let i = 0; i < keys.length; i += 500) await kv(['DEL', ...keys.slice(i, i + 500)])
}

// Each spec file starts from the chain state the global setup left and puts it back afterwards, so
// files don't depend on (or trip over) each other's transactions. Tests inside a file share state
// and run in order; serial (the default) skips the rest of a file after a failure.
export function isolateChain({ serial = true }: { serial?: boolean } = {}) {
  if (serial) test.describe.configure({ mode: 'serial' })
  let snapshot: string
  test.beforeAll(async () => { snapshot = await rpc<string>('evm_snapshot') })
  test.afterAll(async () => {
    await rpc('evm_revert', [snapshot])
    await flushKV()
  })
}

export async function openBuyModal(page: Page, board: string) {
  await page.goto(`/markee/${board}`)
  await page.getByRole('button', { name: 'Buy a New Message' }).click()
}

// A new message on a For Sale board at the modal's default amount (enough to win).
export async function buySale(page: Page, board: string, message: string) {
  await openBuyModal(page, board)
  await page.getByPlaceholder(/^Your message here\.\.\. \(\d+ max\)$/).fill(message)
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Success! Your message is live')).toBeVisible({ timeout: TX_TIMEOUT })
}

// A new message on a Rent board. MIN bids the board minimum, WIN enough to take the top spot, or an
// explicit ETHx/mo rate. WIN works from the listing's rates, which come from the live subgraph rather
// than the fork, so where the two differ an explicit rate is the reliable way to win.
export async function bidRent(page: Page, board: string, message: string, rate: 'MIN' | 'WIN' | { monthly: string }) {
  await openBuyModal(page, board)
  await page.getByPlaceholder(/^Your message here\.\.\. \(\d+ max\)$/).fill(message)
  if (typeof rate === 'string') await page.getByRole('button', { name: rate, exact: true }).click()
  else await page.locator('input[inputmode="decimal"]').first().fill(rate.monthly)
  // "Buy Message" with enough ETHx, "Deposit X ETH and Buy" when the deposit has to be topped up.
  await page.getByRole('button', { name: /^(Buy Message|Deposit .+ and Buy)$/ }).click()
  await expect(page.getByText('Success! Your message is live')).toBeVisible({ timeout: TX_TIMEOUT })
}

export async function openBuyerHub(page: Page) {
  // The board listings the account APIs read are cached in KV for 60s; clear them so the hub reflects
  // the bids a test just made (who's winning, new messages).
  await flushKV()
  await page.goto('/account?section=buyer')
  // The first load after new bids can hit cold listing routes on the fork.
  await expect(page.locator('.acct-row').first()).toBeVisible({ timeout: TX_TIMEOUT })
}

export function messageRow(page: Page, text: string) {
  return page.locator('.acct-row', { hasText: text })
}

// Makes the next transaction the app sends revert on-chain, after the wallet has estimated it fine:
// with automine off, `submit` sends it into the pool, the contract it calls gets code that always
// reverts for the one block that mines it, then gets its own code back. This is the path where a
// receipt comes back reverted, which a gas-estimation failure never reaches.
export async function revertNextTx(submit: () => Promise<void>) {
  type Pool = { pending: Record<string, Record<string, { to: string }>> }
  await rpc('evm_setAutomine', [false])
  try {
    await submit()
    let target: string | undefined
    await expect.poll(async () => {
      const pool = await rpc<Pool>('txpool_content')
      target = Object.values(pool.pending).flatMap(byNonce => Object.values(byNonce))[0]?.to
      return target
    }, { timeout: TX_TIMEOUT }).toBeTruthy()
    const code = await rpc<string>('eth_getCode', [target, 'latest'])
    await rpc('anvil_setCode', [target, '0x60006000fd']) // PUSH1 0 PUSH1 0 REVERT
    await rpc('evm_mine')
    await rpc('anvil_setCode', [target, code])
  } finally {
    await rpc('evm_setAutomine', [true])
  }
}
