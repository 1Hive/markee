import { getAddress, parseAbiItem, type Address, type Hex } from 'viem'

// Minimal structural client shapes so any viem PublicClient/WalletClient is accepted without
// fighting viem's strict transport/chain generics (which createPublicClient bakes in).
type KeeperPublicClient = {
  readContract(args: unknown): Promise<unknown>
  multicall(args: unknown): Promise<unknown[]>
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
const BOARD_CLAIM_TOP = parseAbiItem('function claimTop(address challenger)')

export type KeeperActionStatus = 'planned' | 'confirmed' | 'error'

export interface KeeperAction {
  board: Address
  kind: 'claimTop'
  status: KeeperActionStatus
  challenger?: Address
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
  log?: (msg: string) => void
}

function shortErr(e: unknown): string {
  const m = e as { shortMessage?: string; message?: string }
  return (m?.shortMessage || m?.message || String(e)).split('\n')[0]
}

const BOARD_PAGE = 200n

// Heals the enforced #1 on every streaming board the factory knows about. When the live #1
// (getTopMarkees[0], ranked by effectiveRate) differs from the enforced topMarkee, a decay, a rate
// decrease, or a liquidated top backer left the title stale (the inflow callbacks only auto-heal
// promotions); claimTop realigns it and the money flows. Permissionless and money-safe: funds only
// ever move to the rightful Markee. Backers settle their own RevNet share from the UI (ClaimModal).
export async function runKeeper(p: RunKeeperParams): Promise<KeeperReport> {
  const log = p.log ?? (() => {})
  const actions: KeeperAction[] = []

  const boards = await fetchAllBoards(p.publicClient, p.factory)
  log(`factory ${p.factory}: ${boards.length} board(s)`)
  await healTops(p, boards, actions, log)

  return { boards: boards.length, actions }
}

async function fetchAllBoards(client: KeeperPublicClient, factory: Address): Promise<Address[]> {
  const all: Address[] = []
  for (let offset = 0n; ; offset += BOARD_PAGE) {
    const page = (await client.readContract({
      address: factory,
      abi: [FACTORY_GET_LEADERBOARDS],
      functionName: 'getLeaderboards',
      args: [offset, BOARD_PAGE],
    })) as Address[]
    all.push(...page)
    if (page.length < Number(BOARD_PAGE)) return all
  }
}

type TopRead = { status: 'success'; result: unknown } | { status: 'failure'; error: unknown }

async function healTops(p: RunKeeperParams, boards: Address[], actions: KeeperAction[], log: (m: string) => void) {
  if (boards.length === 0) return
  let reads: TopRead[]
  try {
    reads = (await p.publicClient.multicall({
      allowFailure: true,
      contracts: boards.flatMap(board => [
        { address: board, abi: [BOARD_TOP_MARKEE], functionName: 'topMarkee' },
        { address: board, abi: [BOARD_GET_TOP_MARKEES], functionName: 'getTopMarkees', args: [1n] },
      ]),
    })) as TopRead[]
  } catch (e) {
    for (const board of boards) actions.push({ board, kind: 'claimTop', status: 'error', detail: shortErr(e) })
    log(`top reads failed: ${shortErr(e)}`)
    return
  }

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i]
    const topRead = reads[2 * i]
    const liveRead = reads[2 * i + 1]
    const readFailed = (error: unknown) => {
      actions.push({ board, kind: 'claimTop', status: 'error', detail: shortErr(error) })
      log(`claimTop check failed on ${board}: ${shortErr(error)}`)
    }
    if (topRead.status === 'failure') { readFailed(topRead.error); continue }
    if (liveRead.status === 'failure') { readFailed(liveRead.error); continue }
    const topMarkee = topRead.result as Address
    const [tops, rates] = liveRead.result as readonly [readonly Address[], readonly bigint[]]
    const liveTop = tops[0]
    const liveRate = rates[0] ?? 0n
    if (!liveTop || liveRate === 0n || getAddress(liveTop) === getAddress(topMarkee)) continue

    const action: KeeperAction = { board, kind: 'claimTop', status: 'planned', challenger: liveTop }
    actions.push(action)
    if (!p.walletClient || !p.account) {
      action.detail = 'dry-run'
      continue
    }
    try {
      const hash = await p.walletClient.writeContract({
        address: board, abi: [BOARD_CLAIM_TOP], functionName: 'claimTop', args: [liveTop],
        account: p.account, chain: p.walletClient.chain,
      })
      action.txHash = hash
      const receipt = await p.publicClient.waitForTransactionReceipt({ hash })
      action.status = receipt.status === 'success' ? 'confirmed' : 'error'
      log(`claimTop(${liveTop}) on ${board} → ${action.status}`)
    } catch (e) {
      action.status = 'error'
      action.detail = shortErr(e)
      log(`claimTop(${liveTop}) on ${board} failed: ${shortErr(e)}`)
    }
  }
}
