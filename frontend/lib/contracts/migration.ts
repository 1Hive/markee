import { parseAbi, zeroAddress, type Address, type PublicClient, type Transport } from 'viem'
import type { base } from 'viem/chains'
import { BOARD_MIGRATORS } from '@/lib/contracts/addresses'

const MIGRATOR_ABI = parseAbi([
  'function status(address) view returns (uint8)',
  'function successorOf(address) view returns (address)',
  'function predecessorOf(address) view returns (address)',
  'function markeeSuccessorOf(address) view returns (address)',
])
type BaseClient = PublicClient<Transport, typeof base>

const MARKEE_BOARD_ABI = parseAbi(['function pricingStrategy() view returns (address)'])

export const MIGRATION_FINISHED = 2

export type MigrationState = { status: number; predecessor: Address; predecessorStatus: number }

export function isVisibleBoard(state: MigrationState): boolean {
  if (state.status === MIGRATION_FINISHED) return false
  return state.predecessor === zeroAddress || state.predecessorStatus === MIGRATION_FINISHED
}

function read<T>(client: BaseClient, migrator: Address, functionName: 'status' | 'successorOf' | 'predecessorOf' | 'markeeSuccessorOf', address: Address) {
  return client.readContract({ address: migrator, abi: MIGRATOR_ABI, functionName, args: [address] }) as Promise<T>
}

async function migrationStates(client: BaseClient, migrator: Address, boards: Address[], blockNumber?: bigint): Promise<MigrationState[]> {
  if (boards.length === 0) return []
  const firstPass = await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: boards.flatMap(board => [
      { address: migrator, abi: MIGRATOR_ABI, functionName: 'status' as const, args: [board] },
      { address: migrator, abi: MIGRATOR_ABI, functionName: 'predecessorOf' as const, args: [board] },
    ]),
  })
  const predecessors = boards.map((_, i) => firstPass[i * 2 + 1] as Address)
  const pending = predecessors.filter(p => p !== zeroAddress)
  const predecessorStatuses = pending.length === 0 ? [] : await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: pending.map(p => ({ address: migrator, abi: MIGRATOR_ABI, functionName: 'status' as const, args: [p] })),
  })
  const statusOf = new Map(pending.map((p, i) => [p.toLowerCase(), Number(predecessorStatuses[i])]))
  return boards.map((_, i) => ({
    status: Number(firstPass[i * 2]),
    predecessor: predecessors[i],
    predecessorStatus: statusOf.get(predecessors[i].toLowerCase()) ?? 0,
  }))
}

export type VisibleBoards = { boards: Address[]; predecessorOf: Map<string, Address> }

export async function visibleBoards(client: BaseClient, migrator: Address, boards: Address[], blockNumber?: bigint): Promise<VisibleBoards> {
  const unique = [...new Map(boards.map(b => [b.toLowerCase(), b])).values()]
  const states = await migrationStates(client, migrator, unique, blockNumber)
  const visible = unique.filter((_, i) => isVisibleBoard(states[i]))
  const predecessorOf = new Map(unique.flatMap((board, i) =>
    states[i].predecessor === zeroAddress ? [] : [[board.toLowerCase(), states[i].predecessor] as const]))
  return { boards: visible, predecessorOf }
}

export function originalBoard<T extends string>(board: T, predecessorOf: Map<string, Address>): T | Address {
  return predecessorOf.get(board.toLowerCase()) ?? board
}

const MIGRATORS = Object.values(BOARD_MIGRATORS)

async function readEveryMigrator(client: BaseClient, functionName: 'status' | 'successorOf' | 'predecessorOf' | 'markeeSuccessorOf', address: Address) {
  const results = await client.multicall({
    contracts: MIGRATORS.map(migrator => ({ address: migrator, abi: MIGRATOR_ABI, functionName, args: [address] })),
  })
  if (results.every(r => r.status === 'failure')) throw new Error(`Every migrator failed ${functionName}(${address})`)
  return results.map(r => r.status === 'success' ? r.result as number | Address : (functionName === 'status' ? 0 : zeroAddress))
}

export async function finishedBoardSuccessor(client: BaseClient, board: Address): Promise<Address | null> {
  const statuses = await readEveryMigrator(client, 'status', board)
  const migrator = MIGRATORS[statuses.findIndex(status => Number(status) === MIGRATION_FINISHED)]
  return migrator ? read<Address>(client, migrator, 'successorOf', board) : null
}

export async function finishedMarkeeSuccessor(client: BaseClient, markee: Address): Promise<Address | null> {
  const successors = await readEveryMigrator(client, 'markeeSuccessorOf', markee) as Address[]
  const index = successors.findIndex(successor => successor !== zeroAddress)
  if (index === -1) return null
  const board = await client.readContract({ address: markee, abi: MARKEE_BOARD_ABI, functionName: 'pricingStrategy' })
  return Number(await read<number>(client, MIGRATORS[index], 'status', board)) === MIGRATION_FINISHED ? successors[index] : null
}

const GET_LEADERBOARDS_ABI = parseAbi(['function getLeaderboards(uint256 offset, uint256 limit) view returns (address[])'])
const LISTING_CAP = 1000n

export async function listVisibleBoards(client: BaseClient, migrator: Address, factories: readonly Address[], blockNumber?: bigint): Promise<VisibleBoards> {
  const uniqueFactories = [...new Set(factories)]
  const registered = await Promise.all(uniqueFactories.map(factory =>
    client.readContract({ address: factory, abi: GET_LEADERBOARDS_ABI, functionName: 'getLeaderboards', args: [0n, LISTING_CAP], blockNumber }),
  ))
  for (const [i, boards] of registered.entries()) {
    if (BigInt(boards.length) === LISTING_CAP) console.warn(`[migration] ${uniqueFactories[i]} hit the ${LISTING_CAP}-board getLeaderboards cap`)
  }
  return visibleBoards(client, migrator, registered.flat() as Address[], blockNumber)
}

export async function boardPredecessor(client: BaseClient, board: Address): Promise<Address | null> {
  const predecessors = await readEveryMigrator(client, 'predecessorOf', board) as Address[]
  return predecessors.find(predecessor => predecessor !== zeroAddress) ?? null
}

export async function currentBoard(client: BaseClient, board: Address): Promise<Address> {
  return (await finishedBoardSuccessor(client, board)) ?? board
}

export async function currentMarkee(client: BaseClient, markee: Address): Promise<Address> {
  return (await finishedMarkeeSuccessor(client, markee)) ?? markee
}
