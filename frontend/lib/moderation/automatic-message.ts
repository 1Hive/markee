// Every exception is bound to one exact revision and an explicit visibility scope.
// A revision with a display name also binds the name's hash (v3/v2 formats), so a moderator approves
// the name they saw. Without one, the original formats are unchanged.
export type FalsePositiveScope = 'site' | 'all'
export function falsePositiveMessage(chainId: number, markee: string, hash: string, timestamp: number, scope: FalsePositiveScope = 'site', nameHash?: string): string {
  if (nameHash) return `markee-moderation:false-positive:v3:${JSON.stringify([chainId, markee.toLowerCase(), hash, nameHash, scope, timestamp])}`
  const version = scope === 'all' ? 'v2' : 'v1'
  return `markee-moderation:false-positive:${version}:${JSON.stringify([chainId, markee.toLowerCase(), hash, scope, timestamp])}`
}

// Queue approval explicitly approves this exact text on both display surfaces.
export function approveMessage(chainId: number, markee: string, hash: string, timestamp: number, nameHash?: string): string {
  if (nameHash) return `markee-moderation:approve:v2:${JSON.stringify([chainId, markee.toLowerCase(), hash, nameHash, 'all', timestamp])}`
  return `markee-moderation:approve:v1:${JSON.stringify([chainId, markee.toLowerCase(), hash, 'all', timestamp])}`
}
