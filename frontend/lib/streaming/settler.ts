import { encodeFunctionData, getAddress, parseAbiItem, type Address, type Hex } from 'viem'
import { fetchAllBoards, shortErr, type KeeperPublicClient, type KeeperWalletClient } from './keeper'

export type SettlerPublicClient = KeeperPublicClient & {
  estimateGas(args: unknown): Promise<bigint>
}

const BOARD_PENDING_SETTLEMENT = parseAbiItem('function pendingSettlement(address backer) view returns (uint256)')
const BOARD_SETTLE = parseAbiItem('function settle(address[] backers)')
const MULTICALL3_AGGREGATE3 = parseAbiItem(
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])',
)
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address

// Smallest share worth the gas: below it a settle costs more ETH than it routes.
export const DEFAULT_MIN_PENDING = 100_000_000_000_000n
const PENDING_READ_CHUNK = 300
// Each backer adds ~0.7M gas on top of a ~1.9M base (the RevNet pay), so 8 keeps one settle near 7M.
const BACKERS_PER_SETTLE = 8
// Base caps a transaction at 2^24 gas (EIP-7825). Estimates are packed up to this budget and the batch
// is sent with 30% headroom, which nested RevNet calls need because each CALL forwards only 63/64.
const BATCH_GAS_BUDGET = 12_000_000n
const TX_GAS_CAP = 16_000_000n

export interface SettleAction {
  board: Address
  backers: Address[]
  amount: bigint
  status: 'planned' | 'confirmed' | 'error'
  txHash?: Hex
  detail?: string
}

export interface SettlerReport {
  boards: number
  backers: number
  pending: bigint
  actions: SettleAction[]
}

export interface RunSettlerParams {
  publicClient: SettlerPublicClient
  // Omit walletClient to plan only (dry run): actions are reported as 'planned', nothing is sent.
  walletClient?: KeeperWalletClient
  factory: Address
  fetchBackers(boards: Address[]): Promise<Map<string, string[]>>
  minPending?: bigint
  log?: (msg: string) => void
}

type PendingRead = { status: 'success'; result: unknown } | { status: 'failure'; error: unknown }

// Routes every backer's accrued RevNet share on every streaming board. settle is permissionless and
// pays each backer's tokens to that backer, so the signer only spends gas. Settles from many boards
// are bundled into Multicall3 batches sized to fit one transaction.
export async function runSettler(p: RunSettlerParams): Promise<SettlerReport> {
  const log = p.log ?? (() => {})
  const minPending = p.minPending ?? DEFAULT_MIN_PENDING

  const boards = await fetchAllBoards(p.publicClient, p.factory)
  const sendersByBoard = await p.fetchBackers(boards)
  const pairs = boards.flatMap(board =>
    (sendersByBoard.get(board.toLowerCase()) ?? []).map(backer => ({ board, backer: getAddress(backer) })),
  )
  log(`factory ${p.factory}: ${boards.length} board(s), ${pairs.length} backer position(s)`)

  const owed = new Map<Address, { backer: Address; amount: bigint }[]>()
  for (let i = 0; i < pairs.length; i += PENDING_READ_CHUNK) {
    const chunk = pairs.slice(i, i + PENDING_READ_CHUNK)
    const reads = (await p.publicClient.multicall({
      allowFailure: true,
      contracts: chunk.map(({ board, backer }) => ({
        address: board, abi: [BOARD_PENDING_SETTLEMENT], functionName: 'pendingSettlement', args: [backer],
      })),
    })) as PendingRead[]
    chunk.forEach(({ board, backer }, j) => {
      const read = reads[j]
      if (read.status === 'failure') return log(`pendingSettlement(${backer}) on ${board} failed: ${shortErr(read.error)}`)
      const amount = read.result as bigint
      if (amount < minPending) return
      if (!owed.has(board)) owed.set(board, [])
      owed.get(board)!.push({ backer, amount })
    })
  }

  const actions: SettleAction[] = []
  for (const [board, entries] of owed) {
    for (let i = 0; i < entries.length; i += BACKERS_PER_SETTLE) {
      const slice = entries.slice(i, i + BACKERS_PER_SETTLE)
      actions.push({
        board,
        backers: slice.map(e => e.backer),
        amount: slice.reduce((sum, e) => sum + e.amount, 0n),
        status: 'planned',
      })
    }
  }
  const report: SettlerReport = {
    boards: boards.length,
    backers: actions.reduce((n, a) => n + a.backers.length, 0),
    pending: actions.reduce((sum, a) => sum + a.amount, 0n),
    actions,
  }

  const account = p.walletClient?.account as { address: Address } | undefined
  if (!p.walletClient || !account) {
    for (const a of actions) a.detail = 'dry-run'
    return report
  }

  const estimated: { action: SettleAction; data: Hex; gas: bigint }[] = []
  for (const action of actions) {
    const data = encodeFunctionData({ abi: [BOARD_SETTLE], functionName: 'settle', args: [action.backers] })
    try {
      const gas = await p.publicClient.estimateGas({ account: account.address, to: action.board, data })
      if (gas > BATCH_GAS_BUDGET) throw new Error(`settle needs ${gas} gas, over the batch budget`)
      estimated.push({ action, data, gas })
    } catch (e) {
      action.status = 'error'
      action.detail = shortErr(e)
      log(`settle on ${action.board} failed to estimate: ${action.detail}`)
    }
  }

  const batches: (typeof estimated)[] = []
  let current: typeof estimated = []
  let currentGas = 0n
  for (const item of estimated) {
    if (current.length && currentGas + item.gas > BATCH_GAS_BUDGET) {
      batches.push(current)
      current = []
      currentGas = 0n
    }
    current.push(item)
    currentGas += item.gas
  }
  if (current.length) batches.push(current)

  for (const batch of batches) {
    const sum = batch.reduce((g, item) => g + item.gas, 0n)
    const gas = sum * 13n / 10n + 100_000n
    try {
      const hash = await p.walletClient.writeContract({
        address: MULTICALL3,
        abi: [MULTICALL3_AGGREGATE3],
        functionName: 'aggregate3',
        args: [batch.map(item => ({ target: item.action.board, allowFailure: false, callData: item.data }))],
        gas: gas > TX_GAS_CAP ? TX_GAS_CAP : gas,
        chain: p.walletClient.chain,
      })
      const receipt = await p.publicClient.waitForTransactionReceipt({ hash })
      const status = receipt.status === 'success' ? 'confirmed' : 'error'
      for (const { action } of batch) {
        action.txHash = hash
        action.status = status
      }
      log(`settled ${batch.length} board call(s) in ${hash} → ${status}`)
    } catch (e) {
      for (const { action } of batch) {
        action.status = 'error'
        action.detail = shortErr(e)
      }
      log(`settle batch of ${batch.length} failed: ${shortErr(e)}`)
    }
  }

  return report
}
