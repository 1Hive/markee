// Fork validation: opens a real stream through the ACTUAL frontend encoding helper
// (the same buildPermitTypedData / buildOpenStreamOps the StreamModal uses), against a
// StreamingLeaderboard deployed on a local anvil Base fork. Proves the permit domain
// (version "1") and the 4-op host.batchCall encoding work end-to-end on real forked ETHx.
//
//   BOARD=0x.. SEED=0x.. npx tsx scripts/open-stream-fork.mts

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import {
  STREAMING_BASE,
  SUPERFLUID_HOST_ABI,
  ETHX_READ_ABI,
  CFA_AGREEMENT_ID,
  monthlyToRatePerSec,
  bufferFor,
  openStreamValue,
  buildPermitTypedData,
  buildOpenStreamOps,
  splitSignature,
} from '../lib/superfluid/streaming'

const RPC = process.env.RPC || 'http://localhost:8545'
const BOARD = process.env.BOARD as `0x${string}`
const SEED = process.env.SEED as `0x${string}`
// anvil account[1]
const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as `0x${string}`

const ETHX = STREAMING_BASE.ethx as `0x${string}`
const HOST = STREAMING_BASE.host as `0x${string}`

const account = privateKeyToAccount(PK)
const pub = createPublicClient({ chain: base, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: base, transport: http(RPC) })

const boardAbi = [
  { inputs: [{ name: '', type: 'address' }], name: 'aggregateRate', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'backerMarkee', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'topMarkee', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'backerDeposit', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

async function main() {
  console.log('backer', account.address, 'board', BOARD, 'seed', SEED)

  const ratePerSec = monthlyToRatePerSec(parseEther('0.05'))
  const buffer = bufferFor(ratePerSec)
  const prefund = parseEther('0.05')
  const value = openStreamValue(buffer, prefund)

  const tokenName = (await pub.readContract({ address: ETHX, abi: ETHX_READ_ABI, functionName: 'name' })) as string
  const nonce = (await pub.readContract({ address: ETHX, abi: ETHX_READ_ABI, functionName: 'nonces', args: [account.address] })) as bigint
  const cfaAgreement = (await pub.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID] })) as `0x${string}`
  console.log('tokenName', JSON.stringify(tokenName), 'nonce', nonce, 'cfaAgreement', cfaAgreement)

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const typed = buildPermitTypedData({ tokenName, chainId: base.id, ethx: ETHX, owner: account.address, spender: BOARD, value: buffer, nonce, deadline })
  const sig = await wallet.signTypedData(typed)
  const { v, r, s } = splitSignature(sig)

  const ops = buildOpenStreamOps({ ethx: ETHX, board: BOARD, markee: SEED, backer: account.address, ratePerSec, buffer, cfaAgreement, permit: { deadline, v, r, s } })

  const hash = await wallet.writeContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'batchCall', args: [ops], value })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  console.log('batchCall status:', receipt.status, 'gasUsed:', receipt.gasUsed)

  const agg = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'aggregateRate', args: [SEED] })) as bigint
  const bm = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'backerMarkee', args: [account.address] })) as string
  const top = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'topMarkee' })) as string
  const dep = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'backerDeposit', args: [account.address] })) as bigint

  console.log('aggregateRate(seed):', agg, '(expected', ratePerSec, ')')
  console.log('backerMarkee:', bm, '(expected', SEED, ')')
  console.log('topMarkee:', top, '(expected', SEED, ')')
  console.log('backerDeposit:', formatEther(dep), 'ETHx')

  const ok = receipt.status === 'success' && agg === ratePerSec && bm.toLowerCase() === SEED.toLowerCase() && top.toLowerCase() === SEED.toLowerCase()
  console.log(ok ? '\n✅ STREAM OPENED via the real frontend encoding (permit + batchCall verified)' : '\n❌ assertions failed')
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error('ERROR:', e?.shortMessage || e?.details || e?.message || e)
  process.exit(1)
})
