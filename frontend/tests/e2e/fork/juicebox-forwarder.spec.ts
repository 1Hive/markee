import { test, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { decodeFunctionResult, encodeDeployData, encodeFunctionData, parseAbi, type Abi, type Address, type Hex } from 'viem'
import { E2E_ACCOUNT, E2E_OTHER, TX_TIMEOUT, isolateChain, rpc } from './support'

// MarkeeJuiceboxForwarder (contracts/integrations/juicebox) as a For Rent sign's beneficiary, with the
// app unchanged: create the sign and stream through the app's own modals, deploy and attach the
// forwarder on the fork, then check that anyone's sync() pays the Juicebox project and issues its
// tokens to the backer, and that the app's Claim button keeps working beside it.
isolateChain()

const STREAMING_FACTORY = (process.env.NEXT_PUBLIC_STREAMING_FACTORY ?? '0x37f420fdE5c98e611EB7cb9b74ef579D84697039') as Address
const JB_DIRECTORY: Address = '0x5AfF29060E023e6FB87BE5596652B33c65Af535B'
const JB_TOKENS: Address = '0x1f80d8f057eE36b4C2656D107E4e4558B71bA7D9'
const JB_TERMINAL: Address = '0x130f5Dd2bD8805443Cf41755253D778a75a67f53'
const JB_TERMINAL_STORE: Address = '0x7497ae014A60561925B51C0A3B4adE7460B9927C'
const NATIVE: Address = '0x000000000000000000000000000000000000EEEe'
const CFA_FORWARDER: Address = '0xcfA132E353cB4E398080B9700609bb008eceB125'
const ETHX: Address = '0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93'
// Stands in for the Juicebox project a sign owner would pay (NANA; accepts ETH on Base v6).
const JB_PROJECT = 1n

const factoryAbi = parseAbi([
  'function leaderboardCount() view returns (uint256)',
  'function leaderboards(uint256) view returns (address)',
])
const boardAbi = parseAbi([
  'function setBeneficiaryAddress(address)',
  'function beneficiaryAddress() view returns (address)',
  'function revNetProjectId() view returns (uint256)',
  'function pendingSettlement(address) view returns (uint256)',
])
const tokensAbi = parseAbi(['function totalBalanceOf(address holder, uint256 projectId) view returns (uint256)'])
const storeAbi = parseAbi(['function balanceOf(address terminal, uint256 projectId, address token) view returns (uint256)'])
const cfaAbi = parseAbi(['function getFlowrate(address token, address sender, address receiver) view returns (int96)'])

// Compiles the forwarder from the repo with the same Foundry the fork job installs. It has no imports,
// so this does not need the repo root's node_modules.
function forwarderArtifact(): { abi: Abi; bytecode: Hex } {
  const root = resolve(process.cwd(), '..')
  const out = join(process.cwd(), 'test-results', 'jb-forwarder-out')
  execFileSync('forge', [
    'build', 'contracts/integrations/juicebox/MarkeeJuiceboxForwarder.sol',
    '--out', out, '--cache-path', join(out, 'cache'),
  ], { cwd: root, stdio: 'pipe' })
  const json = JSON.parse(readFileSync(join(out, 'MarkeeJuiceboxForwarder.sol', 'MarkeeJuiceboxForwarder.json'), 'utf8'))
  return { abi: json.abi as Abi, bytecode: json.bytecode.object as Hex }
}

type Receipt = { status: Hex; contractAddress: Address | null }

async function send(from: Address, tx: { to?: Address; data: Hex }): Promise<Receipt> {
  const hash = await rpc<Hex>('eth_sendTransaction', [{ from, ...tx }])
  // Anvil usually mines on submit, but a cold fork can still be fetching state when the receipt is asked for.
  let receipt: Receipt | null = null
  await expect.poll(async () => (receipt = await rpc<Receipt | null>('eth_getTransactionReceipt', [hash])), {
    timeout: TX_TIMEOUT,
  }).not.toBeNull()
  expect(receipt!.status, 'transaction reverted').toBe('0x1')
  return receipt!
}

async function read<T>(to: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> {
  const data = encodeFunctionData({ abi, functionName, args } as never)
  const result = await rpc<Hex>('eth_call', [{ to, data }, 'latest'])
  return decodeFunctionResult({ abi, functionName, data: result } as never) as T
}

async function advance(seconds: number) {
  await rpc('evm_increaseTime', [seconds])
  await rpc('evm_mine')
}

let forwarder: { address: Address; abi: Abi }
let board: Address
let markeeProject: bigint
// Project tokens the 3-day sync issued; the yardstick for "nothing credited" after a Claim.
let threeDayTokens: bigint

const jbBalance = (who: Address, project: bigint) => read<bigint>(JB_TOKENS, tokensAbi, 'totalBalanceOf', [who, project])
const fwdRead = <T>(fn: string, args: unknown[] = []) => read<T>(forwarder.address, forwarder.abi, fn, args)
const sync = (backers: Address[]) =>
  send(E2E_OTHER, { to: forwarder.address, data: encodeFunctionData({ abi: forwarder.abi, functionName: 'sync', args: [backers] }) })

test('create a For Rent sign, attach the forwarder, and stream the first message', async ({ page }) => {
  await page.goto('/create-a-markee')
  await page.getByPlaceholder('My Project').fill('E2E Juicebox Board')
  await page.getByPlaceholder('0x... (receives ETH on Base Network)').fill(E2E_ACCOUNT)
  await page.getByText('For Rent', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Deploy Markee' }).click()
  await expect(page.getByText('Transaction confirmed')).toBeVisible({ timeout: TX_TIMEOUT })

  const count = await read<bigint>(STREAMING_FACTORY, factoryAbi, 'leaderboardCount')
  board = await read<Address>(STREAMING_FACTORY, factoryAbi, 'leaderboards', [count - 1n])
  markeeProject = await read<bigint>(board, boardAbi, 'revNetProjectId')

  // Anyone can deploy the forwarder; the sign's admin (the app's wallet, which created it) attaches it
  // before any backer streams, per the README's attach procedure.
  const { abi, bytecode } = forwarderArtifact()
  const deployed = await send(E2E_OTHER, {
    data: encodeDeployData({ abi, bytecode, args: [JB_DIRECTORY, board, JB_PROJECT, 'Markee E2E'] }),
  })
  forwarder = { address: deployed.contractAddress!, abi }
  await send(E2E_ACCOUNT, { to: board, data: encodeFunctionData({ abi: boardAbi, functionName: 'setBeneficiaryAddress', args: [forwarder.address] }) })
  expect((await read<Address>(board, boardAbi, 'beneficiaryAddress')).toLowerCase()).toBe(forwarder.address.toLowerCase())

  // The app's own activation flow, unchanged.
  await page.getByRole('button', { name: 'Activate Markee →' }).click()
  await page.getByPlaceholder(/Your message here/).fill('e2e juicebox rent message')
  await page.getByRole('button', { name: 'MIN', exact: true }).click()
  await page.getByRole('button', { name: /Review Payment Info|Activate Markee/ }).last().click()
  const confirm = page.getByRole('button', { name: 'Confirm Payment' })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await expect(page.getByText('Success! Your Markee is Activated').first()).toBeVisible({ timeout: TX_TIMEOUT })

  // The leaderboard now streams the beneficiary share to the forwarder.
  const flow = await read<bigint>(CFA_FORWARDER, cfaAbi, 'getFlowrate', [ETHX, board, forwarder.address])
  expect(flow).toBeGreaterThan(0n)
})

test('anyone can sync: the project is paid and its tokens go to the backer', async () => {
  await advance(3 * 86_400)
  const credit = await fwdRead<bigint>('pendingCredit', [E2E_ACCOUNT])
  expect(credit).toBeGreaterThan(0n)

  const projectBefore = await jbBalance(E2E_ACCOUNT, JB_PROJECT)
  const markeeBefore = await jbBalance(E2E_ACCOUNT, markeeProject)
  const keeperBefore = await jbBalance(E2E_OTHER, JB_PROJECT)

  await sync([E2E_ACCOUNT]) // sent by another wallet: the caller only picks the timing

  threeDayTokens = (await jbBalance(E2E_ACCOUNT, JB_PROJECT)) - projectBefore
  expect(threeDayTokens).toBeGreaterThan(0n)
  expect(await jbBalance(E2E_ACCOUNT, markeeProject)).toBeGreaterThan(markeeBefore)
  expect(await jbBalance(E2E_OTHER, JB_PROJECT)).toBe(keeperBefore)
  expect(await read<bigint>(board, boardAbi, 'pendingSettlement', [E2E_ACCOUNT])).toBe(0n)
  expect(await fwdRead<bigint>('owedOf', [E2E_ACCOUNT])).toBe(0n)
})

test("the app's Claim button still works with the forwarder as beneficiary", async ({ page }) => {
  await advance(86_400)
  await page.goto(`/markee/${board}`)
  await page.getByRole('button', { name: 'Claim', exact: true }).click()
  const claim = page.getByRole('button', { name: /^Claim (MARKEE|ETH)$/ })
  await expect(claim).toBeEnabled({ timeout: TX_TIMEOUT })
  await claim.click()
  await expect(page.getByText(/^✓ (MARKEE|ETH) claimed$/)).toBeVisible({ timeout: TX_TIMEOUT })

  // Known limitation: the day claimed outside the forwarder can't be attributed, so a sync now issues
  // nothing for it (only the few seconds that accrued since the Claim). Its ETHx stays in the forwarder,
  // unallocated; nothing is over-credited.
  const projectBefore = await jbBalance(E2E_ACCOUNT, JB_PROJECT)
  await sync([E2E_ACCOUNT])
  const sinceClaim = (await jbBalance(E2E_ACCOUNT, JB_PROJECT)) - projectBefore
  expect(sinceClaim).toBeLessThan(threeDayTokens / 1000n)
  expect(await fwdRead<bigint>('totalOwed')).toBe(0n)
  expect(await fwdRead<bigint>('unallocated')).toBeGreaterThan(0n)
})

test('the weekly sweep moves the unattributable slice into the project', async () => {
  // Left over from the Claim in the previous test: no backer can get tokens for it, but the project
  // still gets the ETH. The first sweep (with the keeper's backer list) records; a week later it sweeps.
  const stranded = await fwdRead<bigint>('unallocated')
  expect(stranded).toBeGreaterThan(0n)
  const sweep = () =>
    send(E2E_OTHER, { to: forwarder.address, data: encodeFunctionData({ abi: forwarder.abi, functionName: 'sweepSurplus', args: [[E2E_ACCOUNT]] }) })

  await sweep()
  expect(await fwdRead<bigint>('sweepMarkAmount')).toBeGreaterThan(0n)

  await advance(7 * 86_400 + 60)
  const projectBefore = await read<bigint>(JB_TERMINAL_STORE, storeAbi, 'balanceOf', [JB_TERMINAL, JB_PROJECT, NATIVE])
  const projectTokensBefore = await jbBalance(E2E_ACCOUNT, JB_PROJECT)
  await sweep() // also syncs the listed backer first, so their week of rent is credited, not swept
  const projectAfter = await read<bigint>(JB_TERMINAL_STORE, storeAbi, 'balanceOf', [JB_TERMINAL, JB_PROJECT, NATIVE])

  expect(projectAfter - projectBefore).toBeGreaterThanOrEqual(stranded)
  expect(await jbBalance(E2E_ACCOUNT, JB_PROJECT)).toBeGreaterThan(projectTokensBefore)
  expect(await fwdRead<bigint>('totalOwed')).toBe(0n)
})

