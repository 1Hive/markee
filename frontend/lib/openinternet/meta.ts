// Signed by a board owner (on-chain admin or creator) to change its oi:meta record. Every field is
// in the message -- empty meaning "unchanged" -- so a signature can't be reused for another change.
export interface MetaUpdate {
  logoUrl?: string
  siteUrl?: string
  removeVerifiedUrl?: string
}

export function metaUpdateMessage(chainId: number | string, board: string, update: MetaUpdate, timestamp: number): string {
  const fields = [update.logoUrl ?? '', update.siteUrl ?? '', update.removeVerifiedUrl ?? ''].join('|')
  return `markee-meta:update:${chainId}:${board.toLowerCase()}:${fields}:${timestamp}`
}
