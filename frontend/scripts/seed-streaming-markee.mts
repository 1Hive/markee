// Fork seeding: createMarkee(message,name) on a StreamingLeaderboard, then open a stream to it
// above the incumbent rate so it becomes the visible #1 (marketplace filters out top markees with
// an empty message, and streaming messages are only set at createMarkee). Reuses the real frontend
// encoding helpers (buildOpenStreamOps / buildPermitTypedData) so this exercises the true path.
//
//   RPC=<box> BOARD=0x.. MESSAGE="gm" NAME="Genesis" RATE_ETH_MONTH=0.1 npx tsx scripts/seed-streaming-markee.mts

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
const MESSAGE = process.env.MESSAGE || 'gm — streaming is live ⚡'
const NAME = process.env.NAME || 'Streaming Genesis'
const RATE_ETH_MONTH = process.env.RATE_ETH_MONTH || '0.1'

// anvil account[0] creates the markee (needs gas only), account[2] backs it (fresh backer, so it
// stacks on top of the existing seed stream rather than re-targeting it).
const CREATOR_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`
const BACKER_PK  = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as `0x${string}`

const ETHX = STREAMING_BASE.ethx as `0x${string}`
const HOST = STREAMING_BASE.host as `0x${string}`

const creator = privateKeyToAccount(CREATOR_PK)
const backer  = privateKeyToAccount(BACKER_PK)
const pub = createPublicClient({ chain: base, transport: http(RPC) })
const creatorWallet = createWalletClient({ account: creator, chain: base, transport: http(RPC) })
const backerWallet  = createWalletClient({ account: backer,  chain: base, transport: http(RPC) })

const boardAbi = [
  { inputs: [{ name: 'message', type: 'string' }, { name: 'name', type: 'string' }], name: 'createMarkee', outputs: [{ name: 'markeeAddress', type: 'address' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'limit', type: 'uint256' }], name: 'getTopMarkees', outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topRates', type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'aggregateRate', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'topMarkee', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

const markeeAbi = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

async function main() {
  console.log('board', BOARD, '\ncreator', creator.address, '\nbacker', backer.address)

  // 1) createMarkee — message is set through the strategy path here (owner setMessage is gated).
  const { result: newMarkee } = await pub.simulateContract({
    account: creator, address: BOARD, abi: boardAbi, functionName: 'createMarkee', args: [MESSAGE, NAME],
  })
  const createHash = await creatorWallet.writeContract({
    address: BOARD, abi: boardAbi, functionName: 'createMarkee', args: [MESSAGE, NAME],
  })
  await pub.waitForTransactionReceipt({ hash: createHash })
  console.log('\ncreated markee:', newMarkee)
  console.log('message on-chain:', JSON.stringify(await pub.readContract({ address: newMarkee, abi: markeeAbi, functionName: 'message' })))

  // 2) open a stream to it above the incumbent 0.05 ETH/mo so it becomes #1.
  const ratePerSec = monthlyToRatePerSec(parseEther(RATE_ETH_MONTH))
  const buffer = bufferFor(ratePerSec)
  const prefund = parseEther(RATE_ETH_MONTH)
  const value = openStreamValue(buffer, prefund)

  const tokenName = (await pub.readContract({ address: ETHX, abi: ETHX_READ_ABI, functionName: 'name' })) as string
  const nonce = (await pub.readContract({ address: ETHX, abi: ETHX_READ_ABI, functionName: 'nonces', args: [backer.address] })) as bigint
  const cfaAgreement = (await pub.readContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'getAgreementClass', args: [CFA_AGREEMENT_ID] })) as `0x${string}`

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const typed = buildPermitTypedData({ tokenName, chainId: base.id, ethx: ETHX, owner: backer.address, spender: BOARD, value: buffer, nonce, deadline })
  const sig = await backerWallet.signTypedData(typed)
  const { v, r, s } = splitSignature(sig)

  const ops = buildOpenStreamOps({ ethx: ETHX, board: BOARD, markee: newMarkee, backer: backer.address, ratePerSec, buffer, cfaAgreement, permit: { deadline, v, r, s } })
  const hash = await backerWallet.writeContract({ address: HOST, abi: SUPERFLUID_HOST_ABI, functionName: 'batchCall', args: [ops], value })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  console.log('\nstream batchCall status:', receipt.status, 'gasUsed:', receipt.gasUsed)

  const agg = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'aggregateRate', args: [newMarkee] })) as bigint
  const top = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'topMarkee' })) as string
  const [tops, rates] = (await pub.readContract({ address: BOARD, abi: boardAbi, functionName: 'getTopMarkees', args: [3n] })) as [string[], bigint[]]

  console.log('aggregateRate(new):', formatEther(agg * 2628000n), 'ETH/mo')
  console.log('topMarkee:', top)
  console.log('getTopMarkees(3):', tops.map((t, i) => `${t} @ ${formatEther(rates[i] * 2628000n)} ETH/mo`))

  const ok = receipt.status === 'success' && top.toLowerCase() === newMarkee.toLowerCase()
  console.log(ok ? '\n✅ SEEDED: message-bearing markee is now #1' : '\n❌ new markee did not become #1')
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error('ERROR:', e?.shortMessage || e?.details || e?.message || e)
  process.exit(1)
})
