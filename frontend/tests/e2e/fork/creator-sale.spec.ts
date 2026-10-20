import { test, expect, type Page } from '@playwright/test'
import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem'
import { observeMessage } from '../../../lib/moderation/queue'
import { E2E_ACCOUNT, E2E_OTHER as OTHER, TX_TIMEOUT, buySale, isolateChain, kv, rpc } from './support'

const TOP_ABI = parseAbi(['function getTopMarkees(uint256 limit) view returns (address[], uint256[])'])

// Creating a For Sale board, activating it, and running every Manage drawer setting on it.
isolateChain()

const BOARD_NAME = 'E2E Sale Board'
let board = ''

async function openDrawer(page: Page) {
  await page.goto('/account?section=creator')
  const row = page.locator('.acct-row', { hasText: 'example.com' })
  await expect(row).toBeVisible({ timeout: TX_TIMEOUT })
  await row.getByRole('button', { name: 'Manage' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return page.getByRole('dialog')
}

async function editSetting(page: Page, label: string, value: string, toast: string) {
  const drawer = await openDrawer(page)
  const row = drawer.locator('div', { has: page.getByText(label, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
  await row.getByRole('button', { name: 'Edit' }).click()
  await row.getByRole('textbox').fill(value)
  await row.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: toast })).toBeVisible({ timeout: TX_TIMEOUT })
}

test('create a For Sale board and activate it', async ({ page }) => {
  await page.goto('/create-a-markee')
  await page.getByPlaceholder('My Project').fill(BOARD_NAME)
  await page.getByPlaceholder('0x... (receives ETH on Base Network)').fill(E2E_ACCOUNT)
  await page.getByText('For Sale', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Deploy Markee' }).click()
  await expect(page.getByText('Transaction confirmed')).toBeVisible({ timeout: TX_TIMEOUT })

  // Activate: the first message.
  await page.getByRole('button', { name: 'Activate Markee →' }).click()
  await page.getByPlaceholder('Your message here...').fill('e2e first message')
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: /Confirm Payment|Activate Markee/ }).last().click()
  await page.waitForURL(/\/markee\/0x[0-9a-fA-F]{40}/, { timeout: TX_TIMEOUT })
  board = page.url().match(/0x[0-9a-fA-F]{40}/)![0]
})

test('the board shows in Your Markees once it is on a site', async ({ page }) => {
  // Verifying a real site needs the public internet; seed the verified integration in local KV.
  await kv(['SET', `oi:meta:${board.toLowerCase()}`, JSON.stringify({ verifiedUrls: ['https://example.com'], verifiedUrl: 'https://example.com', status: 'verified' })])
  await kv(['DEL', 'cache:forsale:leaderboards'])
  const drawer = await openDrawer(page)
  await expect(drawer.getByText('Integrated Sites')).toBeVisible()
})

test('change the minimum price', async ({ page }) => {
  await editSetting(page, 'Minimum Price', '0.002', 'Minimum price updated')
})

test('change the beneficiary', async ({ page }) => {
  await editSetting(page, 'Beneficiary', OTHER, 'Beneficiary updated')
})

test('change the max message length', async ({ page }) => {
  await editSetting(page, 'Max Message Characters', '150', 'Message limit updated')
})

test('add a moderator (signed message)', async ({ page }) => {
  const drawer = await openDrawer(page)
  await drawer.getByRole('button', { name: 'Add Moderator' }).click()
  await drawer.getByPlaceholder('Wallet (0x…)').fill(OTHER)
  await drawer.getByRole('button', { name: 'Add', exact: true }).click()
  await drawer.getByRole('button', { name: 'Save moderators' }).click()
  await expect(drawer.getByText('Moderators saved')).toBeVisible({ timeout: TX_TIMEOUT })
})

// The moderation-scan cron crawls every board on Base, which takes most of ten minutes against a
// cold fork. Instead, queue the one new message the way the scan would: same observeMessage(), same
// KV keys. The purchase and the signed Approve are real.
async function queueForReview(markee: string, message: string) {
  const at = Math.floor(Date.now() / 1000)
  const item = observeMessage(null, {
    markee: markee.toLowerCase(), board: board.toLowerCase(), message, name: '', author: E2E_ACCOUNT.toLowerCase(),
    blockNumber: BigInt(await rpc<string>('eth_blockNumber')).toString(), at,
  }, { flagged: { board: false, site: false }, preexisting: false })!
  await kv(['SET', `moderation:item:8453:${markee.toLowerCase()}`, JSON.stringify(item)])
  await kv(['ZADD', `moderation:pending:${board.toLowerCase()}`, at, markee.toLowerCase()])
  await kv(['ZADD', 'moderation:pending:site', at, markee.toLowerCase()])
}

test('approve a new message from the moderation queue (signed message)', async ({ page }) => {
  await buySale(page, board, 'e2e needs review')
  const top = await rpc<string>('eth_call', [{ to: board, data: encodeFunctionData({ abi: TOP_ABI, args: [1n] }) }, 'latest'])
  const [[markee]] = decodeFunctionResult({ abi: TOP_ABI, data: top as `0x${string}` })
  await queueForReview(markee, 'e2e needs review')

  await page.goto('/account?section=creator')
  const item = page.locator('div', { hasText: 'e2e needs review' }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last()
  await item.getByRole('button', { name: 'Approve' }).click({ timeout: TX_TIMEOUT })
  await expect(page.getByRole('status').filter({ hasText: 'Message approved' })).toBeVisible({ timeout: TX_TIMEOUT })
})

test('transfer admin', async ({ page }) => {
  const drawer = await openDrawer(page)
  await drawer.getByRole('button', { name: 'Transfer Admin' }).click()
  await drawer.getByPlaceholder('New admin wallet (0x…)').fill(OTHER)
  await drawer.getByRole('checkbox').check()
  await drawer.getByRole('button', { name: 'Transfer Admin' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Admin transferred' })).toBeVisible({ timeout: TX_TIMEOUT })
})
