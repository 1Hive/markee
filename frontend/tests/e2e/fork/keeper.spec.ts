import { test, expect } from '@playwright/test'
import { BOARDS, TX_TIMEOUT, bidRent, isolateChain, messageRow, openBuyerHub, rpc } from './support'

// The streaming keeper cron: claimTop on every board whose live #1 drifted from topMarkee, signed by
// the keeper hot wallet (KEEPER_PRIVATE_KEY on the E2E server).
isolateChain()

type Action = { board: string; status: string; challenger?: string; detail?: string }
type Report = { ok: boolean; boards: number; actions: Action[] }

async function keeper(request: import('@playwright/test').APIRequestContext, dryRun = false) {
  const res = await request.get(`/api/cron/streaming-keeper${dryRun ? '?dryRun=1' : ''}`, { headers: { Authorization: 'Bearer e2e' }, timeout: 300_000 })
  expect(res.ok()).toBe(true)
  return await res.json() as Report
}

async function topMarkee(board: string) {
  return '0x' + (await rpc<string>('eth_call', [{ to: board, data: '0x9d103de8' }, 'latest'])).slice(-40) // topMarkee()
}

test('claims the top back after the winner lowers their rate', async ({ page, request }) => {
  test.setTimeout(600_000)
  // Take the top, then drop below the old winner: a decrease fires no inflow callback that could
  // hand the title back, so topMarkee stays ours until the keeper claims it for the live #1.
  // The board's winner streams ~0.009 ETH/mo at the fork block, its minimum is 0.001.
  await bidRent(page, BOARDS.rent, 'e2e keeper drift', { monthly: '0.02' })
  const ours = await topMarkee(BOARDS.rent)
  await openBuyerHub(page)
  await messageRow(page, 'e2e keeper drift').getByRole('button', { name: 'Change Bid' }).click()
  await page.getByRole('button', { name: 'MIN', exact: true }).click()
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Success! Your rate is updated')).toBeVisible({ timeout: TX_TIMEOUT })
  expect(await topMarkee(BOARDS.rent)).toBe(ours)

  const planned = await keeper(request, true)
  expect(planned.actions.map(a => a.board.toLowerCase())).toContain(BOARDS.rent.toLowerCase())

  const run = await keeper(request)
  expect(run.actions.filter(a => a.status !== 'confirmed')).toEqual([])
  for (const a of run.actions) expect(await topMarkee(a.board)).toBe(a.challenger!.toLowerCase())
  expect(await topMarkee(BOARDS.rent)).not.toBe(ours)

  // Healed: a second pass finds nothing to do.
  expect((await keeper(request, true)).actions).toEqual([])
})
