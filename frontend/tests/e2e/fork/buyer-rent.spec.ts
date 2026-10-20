import { test, expect } from '@playwright/test'
import { BOARDS, TX_TIMEOUT, bidRent, isolateChain, messageRow, openBuyModal, openBuyerHub } from './support'

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
