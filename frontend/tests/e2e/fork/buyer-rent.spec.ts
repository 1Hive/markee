import { test, expect } from '@playwright/test'
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem'
import { ANVIL } from './env'
import { BOARDS, E2E_ACCOUNT, TX_TIMEOUT, bidRent, isolateChain, messageRow, openBuyModal, openBuyerHub } from './support'

const DEPOSIT_ABI = parseAbi(['function backerDeposit(address) view returns (uint256)'])
const FLOW_ABI = parseAbi(['function getFlowrate(address token, address sender, address receiver) view returns (int96)', 'function setFlowrate(address token, address receiver, int96 flowrate) returns (bool)'])
const CFA_FORWARDER = '0xcfA132E353cB4E398080B9700609bb008eceB125'
const ETHX = '0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93'
const chain = createPublicClient({ transport: http(ANVIL) })
const wallet = createWalletClient({ account: E2E_ACCOUNT, transport: http(ANVIL) })
const heldDeposit = (board: string) => chain.readContract({ address: board as Address, abi: DEPOSIT_ABI, functionName: 'backerDeposit', args: [E2E_ACCOUNT] })
const flowRate = (board: string) => chain.readContract({ address: CFA_FORWARDER, abi: FLOW_ABI, functionName: 'getFlowrate', args: [ETHX, E2E_ACCOUNT, board as Address] })

// Rent board buyer flows beyond the first bid: changing the rate, editing the message, moving a
// stream to another message, and cancelling.
isolateChain()

const MESSAGE = 'e2e rent winner'
const EDITED = 'e2e rent edited'

test('win a Rent board', async ({ page }) => {
  await bidRent(page, BOARDS.rentCheap, MESSAGE, 'WIN')
})

test('change the bid from the Buyer Hub', async ({ page }) => {
  await openBuyerHub(page)
  await messageRow(page, MESSAGE).getByRole('button', { name: 'Change Bid' }).click()
  await expect(page.getByText('MANAGE YOUR STREAM')).toBeVisible()
  await page.getByRole('button', { name: '2X', exact: true }).click()
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Success! Your rate is updated')).toBeVisible({ timeout: TX_TIMEOUT })
})

test('edit the Rent message', async ({ page }) => {
  await openBuyerHub(page)
  await messageRow(page, MESSAGE).getByRole('button', { name: 'Change Bid' }).click()
  await expect(page.getByText('MANAGE YOUR STREAM')).toBeVisible()
  await page.getByTitle('Edit message').click()
  await page.locator('textarea:visible').first().fill(EDITED)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  // The editor closes once the tx confirms; the Buyer Hub then reads the new text back from chain.
  await expect(page.locator('textarea:visible')).toHaveCount(0, { timeout: TX_TIMEOUT })
  await openBuyerHub(page)
  await expect(messageRow(page, EDITED)).toBeVisible({ timeout: TX_TIMEOUT })
})

test('move a stream to another message', async ({ page }) => {
  // Stream to our own message, then put that stream behind the board's winner. (The board's other
  // messages come and go: their rates are read from the live subgraph, not the fork.)
  await bidRent(page, BOARDS.rentWithWinner, 'e2e move from', 'MIN')

  await openBuyModal(page, BOARDS.rentWithWinner)
  const winner = page.locator('div', { hasText: 'Go with the Flow' }).filter({ has: page.getByRole('button', { name: '+ Fund' }) }).last()
  await winner.getByRole('button', { name: '+ Fund' }).click()
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Success! Your stream moved to this message')).toBeVisible({ timeout: TX_TIMEOUT })
})

test('cancel the stream', async ({ page }) => {
  await openBuyerHub(page)
  await messageRow(page, EDITED).getByRole('button', { name: 'Change Bid' }).click()
  await expect(page.getByText('MANAGE YOUR STREAM')).toBeVisible()
  await page.getByRole('button', { name: /^Cancel (Stream|Bid)$/ }).click()
  await expect(page.getByRole('button', { name: /^Cancel (Stream|Bid)$/ })).toBeHidden({ timeout: TX_TIMEOUT })

  await openBuyerHub(page)
  await expect(messageRow(page, EDITED).getByText('Stream ended')).toBeVisible({ timeout: TX_TIMEOUT })
})

test('reactivating after a cancel reuses the deposit the board still holds', async ({ page }) => {
  const before = await heldDeposit(BOARDS.rentCheap)
  expect(before).toBeGreaterThan(0n)
  await openBuyModal(page, BOARDS.rentCheap)
  const row = page.locator('div', { hasText: EDITED }).filter({ has: page.getByRole('button', { name: '+ Fund' }) }).last()
  await row.getByRole('button', { name: '+ Fund' }).click()
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText(/^Success!/)).toBeVisible({ timeout: TX_TIMEOUT })
  const rate = await flowRate(BOARDS.rentCheap)
  expect(rate).toBeGreaterThan(0n)
  const buffer = rate * 14_400n
  const after = await heldDeposit(BOARDS.rentCheap)
  expect(after).toBe(before > buffer ? before : buffer)
})

test('reclaim the deposit a cancelled stream left on its board', async ({ page }) => {
  const stop = await wallet.writeContract({ address: CFA_FORWARDER, abi: FLOW_ABI, functionName: 'setFlowrate', args: [ETHX, BOARDS.rentCheap, 0n], chain: null })
  await chain.waitForTransactionReceipt({ hash: stop })
  expect(await flowRate(BOARDS.rentCheap)).toBe(0n)
  expect(await heldDeposit(BOARDS.rentCheap)).toBeGreaterThan(0n)
  const reclaim = page.getByRole('button', { name: 'Reclaim', exact: true }).and(page.locator(':enabled')).first()
  await expect(async () => {
    await page.goto('/account?section=buyer')
    await expect(reclaim).toBeVisible({ timeout: 10_000 })
  }).toPass({ timeout: TX_TIMEOUT })
  await reclaim.click()
  await expect(page.getByRole('status').filter({ hasText: /^Returned .* ETHx from/ })).toBeVisible({ timeout: TX_TIMEOUT })
  await expect.poll(() => heldDeposit(BOARDS.rentCheap), { timeout: TX_TIMEOUT }).toBe(0n)
})

test('an owned message with no funding stays in the hub, last, with Reactivate', async ({ page }) => {
  // "e2e move from" lost its only stream to the move above.
  await openBuyerHub(page)
  const row = messageRow(page, 'e2e move from')
  await expect(row.getByText('Stopped')).toBeVisible({ timeout: TX_TIMEOUT })
  await expect(page.locator('.acct-row').last()).toContainText(/e2e (move from|rent edited)/)

  await row.getByRole('button', { name: 'Reactivate' }).click()
  await page.getByRole('button', { name: 'Review Payment Info' }).click()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText(/^Success! Your (stream moved to this message|message is live)/)).toBeVisible({ timeout: TX_TIMEOUT })

  await openBuyerHub(page)
  await expect(messageRow(page, 'e2e move from').getByRole('button', { name: 'Reactivate' })).toHaveCount(0)

})
