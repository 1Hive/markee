// v2 distinguishes omitted fields (unchanged) from empty strings (clear), and
// encodes delimiters unambiguously. v1 remains available for safe older clients.
export interface MetaUpdate {
  logoUrl?: string
  siteUrl?: string
  removeVerifiedUrl?: string
}

export function metaUpdateMessage(chainId: number | string, board: string, update: MetaUpdate, timestamp: number, version: 1 | 2 = 2): string {
  const values = [update.logoUrl, update.siteUrl, update.removeVerifiedUrl]
  if (version === 1) {
    return `markee-meta:update:${chainId}:${board.toLowerCase()}:${values.map(v => v ?? '').join('|')}:${timestamp}`
  }
  return `markee-meta:update:v2:${JSON.stringify([String(chainId), board.toLowerCase(), ...values.map(v => v ?? null), timestamp])}`
}

export function metaFields(update: MetaUpdate, version: 1 | 2): MetaUpdate {
  return {
    ...(update.logoUrl !== undefined && (version === 2 || update.logoUrl !== '') ? { logoUrl: update.logoUrl } : {}),
    ...(update.siteUrl !== undefined && (version === 2 || update.siteUrl !== '') ? { siteUrl: update.siteUrl } : {}),
  }
}
