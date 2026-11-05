import { test, expect, type Page } from '@playwright/test'
import { BOARDS, TX_TIMEOUT, bidRent, isolateChain, revertNextTx, rpc } from './support'

// Claiming what a winning stream has earned (ClaimModal's settle), from the Rent board page.
isolateChain()

async function openClaim(page: Page) {
  await page.goto(`/markee/${BOARDS.rentCheap}`)
  await page.getByRole('button', { name: 'Claim', exact: true }).click()
  return page.getByRole('button', { name: /^Claim (MARKEE|ETH)$/ })
}

test('win a Rent board and let it accrue', async ({ page }) => {
  await bidRent(page, BOARDS.rentCheap, 'e2e claim winner', 'WIN')
  await rpc('evm_increaseTime', [86_400])
  await rpc('evm_mine')
})

test('a reverted claim shows an error', async ({ page }) => {
  const claim = await openClaim(page)
  await expect(claim).toBeEnabled({ timeout: TX_TIMEOUT })
  await revertNextTx(() => claim.click())
  await expect(page.getByText('Transaction failed on-chain. Please try again.')).toBeVisible({ timeout: TX_TIMEOUT })
  await expect(claim).toBeEnabled()
})

test('claim the earnings', async ({ page }) => {
  const claim = await openClaim(page)
  await expect(claim).toBeEnabled({ timeout: TX_TIMEOUT })
  await claim.click()
  await expect(page.getByText(/^✓ (MARKEE|ETH) claimed$/)).toBeVisible({ timeout: TX_TIMEOUT })
})
