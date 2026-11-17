import { parseCurrentAddress } from '@/lib/contracts/currentAddress'

export type ListedRow = { address?: string; migratedFrom?: string | null }

export function originalAddress(row: ListedRow): string {
  return (row.migratedFrom ?? row.address ?? '').toLowerCase()
}

export function successorsOf(board: string, predecessorOf: ReadonlyMap<string, string>): string[] {
  const target = board.toLowerCase()
  return [...predecessorOf].flatMap(([successor, predecessor]) => predecessor.toLowerCase() === target ? [successor] : [])
}

export function isBoostedBoard(board: string, predecessorOf: ReadonlyMap<string, string>, boosted: ReadonlySet<string>): boolean {
  const own = board.toLowerCase()
  const predecessor = predecessorOf.get(own)?.toLowerCase()
  return boosted.has(own) || (!!predecessor && boosted.has(predecessor))
}

export function inheritBoosts(multipliers: Record<string, number>, predecessorOf: ReadonlyMap<string, string>): Record<string, number> {
  const inherited = { ...multipliers }
  for (const [successor, predecessor] of predecessorOf) {
    const legacyMultiplier = multipliers[predecessor.toLowerCase()]
    if (legacyMultiplier !== undefined && inherited[successor] === undefined) inherited[successor] = legacyMultiplier
  }
  return inherited
}

export function currentBoardFromResolution<T extends string>(requested: T, resolution: unknown): T | `0x${string}` {
  const parsed = parseCurrentAddress(resolution)
  return parsed?.kind === 'board' ? parsed.address : requested
}
