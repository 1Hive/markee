import {
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
} from 'viem'

// Minimal structural client shapes so any viem PublicClient/WalletClient is accepted without
// fighting viem's strict transport/chain generics (which createPublicClient bakes in).
type KeeperPublicClient = {
  readContract(args: unknown): Promise<unknown>
  getLogs(args: unknown): Promise<unknown[]>
  waitForTransactionReceipt(args: unknown): Promise<{ status: 'success' | 'reverted' | string }>
}
type KeeperWalletClient = {
  chain?: unknown
  writeContract(args: unknown): Promise<Hex>
}

// Minimal ABI surface the keeper touches (kept inline so this runs under both Next and tsx).
const FACTORY_GET_LEADERBOARDS = parseAbiItem('function getLeaderboards(uint256 offset, uint256 limit) view returns (address[])')
const BOARD_TOP_MARKEE = parseAbiItem('function topMarkee() view returns (address)')
const BOARD_GET_TOP_MARKEES = parseAbiItem('function getTopMarkees(uint256 limit) view returns (address[], uint256[])')
const BOARD_PENDING_SETTLEMENT = parseAbiItem('function pendingSettlement(address backer) view returns (uint256)')
const BOARD_CLAIM_TOP = parseAbiItem('function claimTop(address challenger)')
const BOARD_SETTLE = parseAbiItem('function settle(address[] backers)')
const BACKER_UPDATED = parseAbiItem('event BackerUpdated(address indexed backer, address indexed markee, uint256 flowRate, uint256 newAggregate)')

export type KeeperActionKind = 'claimTop' | 'settle'
export type KeeperActionStatus = 'planned' | 'confirmed' | 'error'

export interface KeeperAction {
  board: Address
  kind: KeeperActionKind
  status: KeeperActionStatus
  challenger?: Address
  backers?: Address[]
  txHash?: Hex
  detail?: string
}

export interface KeeperReport {
  boards: number
  actions: KeeperAction[]
}

export interface RunKeeperParams {
  publicClient: KeeperPublicClient
  // Omit walletClient to plan only (dry run): actions are reported as 'planned', nothing is sent.
  walletClient?: KeeperWalletClient
  account?: Address
  factory: Address
  settle?: boolean       // also flush RevNet settlement (default true)
  fromBlock?: bigint     // BackerUpdated log-scan start for settle (default 0n)
  settleChunk?: number   // backers per settle tx (default 50)
  log?: (msg: string) => void
}

function shortErr(e: unknown): string {
  const m = e as { shortMessage?: string; message?: string }
  return (m?.shortMessage || m?.message || String(e)).split('\n')[0]
}

const ZERO = '0x0000000000000000000000000000000000000000'

// Active backers on a board, deduped from BackerUpdated logs (emitted on every stream open/update).
async function enumerateBackers(client: KeeperPublicClient, board: Address, fromBlock: bigint): Promise<Address[]> {
  const logs = await client.getLogs({ address: board, event: BACKER_UPDATED, fromBlock, toBlock: 'latest' })
  const set = new Set<Address>()
  for (const l of logs) {
    const backer = (l as { args?: { backer?: Address } }).args?.backer
    if (backer && backer !== ZERO) set.add(getAddress(backer))
  }
  return [...set]
}

// Heals every streaming board the factory knows about:
//   1. claimTop — when the live #1 (getTopMarkees[0], ranked by effectiveRate) differs from the enforced
//      topMarkee, a decay/decrease left the title stale; poke claimTop to realign it (and the money flows).
//   2. settle — flush each backer's accrued RevNet share (lower priority; an accounting catch-up).
// Both are permissionless and money-safe: funds only ever move to the rightful Markee/backer.
export async function runKeeper(p: RunKeeperParams): Promise<KeeperReport> {
  const log = p.log ?? (() => {})
  const settleEnabled = p.settle ?? true
  const chunkSize = p.settleChunk ?? 50
  const actions: KeeperAction[] = []

  const boards = (await p.publicClient.readContract({
    address: p.factory,
    abi: [FACTORY_GET_LEADERBOARDS],
    functionName: 'getLeaderboards',
    args: [0n, 200n],
  })) as Address[]
  log(`factory ${p.factory}: ${boards.length} board(s)`)

  for (const board of boards) {
    await healTop(p, board, actions, log)
    if (settleEnabled) await flushSettlement(p, board, chunkSize, actions, log)
  }

  return { boards: boards.length, actions }
}

async function healTop(p: RunKeeperParams, board: Address, actions: KeeperAction[], log: (m: string) => void) {
  try {
    const [topMarkee, top] = await Promise.all([
      p.publicClient.readContract({ address: board, abi: [BOARD_TOP_MARKEE], functionName: 'topMarkee' }) as Promise<Address>,
      p.publicClient.readContract({ address: board, abi: [BOARD_GET_TOP_MARKEES], functionName: 'getTopMarkees', args: [1n] }) as Promise<readonly [readonly Address[], readonly bigint[]]>,
    ])
    const liveTop = top[0]?.[0]
    const liveRate = top[1]?.[0] ?? 0n
    if (!liveTop || liveRate === 0n || getAddress(liveTop) === getAddress(topMarkee)) return

    const action: KeeperAction = { board, kind: 'claimTop', status: 'planned', challenger: liveTop }
    if (p.walletClient && p.account) {
      const hash = await p.walletClient.writeContract({
        address: board, abi: [BOARD_CLAIM_TOP], functionName: 'claimTop', args: [liveTop],
        account: p.account, chain: p.walletClient.chain,
      })
      action.txHash = hash
      const receipt = await p.publicClient.waitForTransactionReceipt({ hash })
      action.status = receipt.status === 'success' ? 'confirmed' : 'error'
      log(`claimTop(${liveTop}) on ${board} → ${action.status}`)
    } else {
      action.detail = 'dry-run'
    }
    actions.push(action)
  } catch (e) {
    actions.push({ board, kind: 'claimTop', status: 'error', detail: shortErr(e) })
    log(`claimTop check failed on ${board}: ${shortErr(e)}`)
  }
}

async function flushSettlement(p: RunKeeperParams, board: Address, chunkSize: number, actions: KeeperAction[], log: (m: string) => void) {
  try {
    const backers = await enumerateBackers(p.publicClient, board, p.fromBlock ?? 0n)
    const owed: Address[] = []
    for (const backer of backers) {
      const amount = (await p.publicClient.readContract({
        address: board, abi: [BOARD_PENDING_SETTLEMENT], functionName: 'pendingSettlement', args: [backer],
      })) as bigint
      if (amount > 0n) owed.push(backer)
    }
    if (owed.length === 0) return

    for (let i = 0; i < owed.length; i += chunkSize) {
      const chunk = owed.slice(i, i + chunkSize)
      const action: KeeperAction = { board, kind: 'settle', status: 'planned', backers: chunk }
      if (p.walletClient && p.account) {
        const hash = await p.walletClient.writeContract({
          address: board, abi: [BOARD_SETTLE], functionName: 'settle', args: [chunk],
          account: p.account, chain: p.walletClient.chain,
        })
        action.txHash = hash
        const receipt = await p.publicClient.waitForTransactionReceipt({ hash })
        action.status = receipt.status === 'success' ? 'confirmed' : 'error'
        log(`settle(${chunk.length}) on ${board} → ${action.status}`)
      } else {
        action.detail = 'dry-run'
      }
      actions.push(action)
    }
  } catch (e) {
    actions.push({ board, kind: 'settle', status: 'error', detail: shortErr(e) })
    log(`settle failed on ${board}: ${shortErr(e)}`)
  }
}
