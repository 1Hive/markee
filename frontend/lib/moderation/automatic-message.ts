// Every exception is bound to one exact revision and an explicit visibility scope.
export type FalsePositiveScope = 'site' | 'all'
export function falsePositiveMessage(chainId: number, markee: string, hash: string, timestamp: number, scope: FalsePositiveScope = 'site'): string {
  const version = scope === 'all' ? 'v2' : 'v1'
  return `markee-moderation:false-positive:${version}:${JSON.stringify([chainId, markee.toLowerCase(), hash, scope, timestamp])}`
}
