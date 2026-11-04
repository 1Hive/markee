// A site exception is scoped to one exact revision, independent of detector updates.
export function falsePositiveMessage(chainId: number, markee: string, hash: string, timestamp: number): string {
  return `markee-moderation:false-positive:v1:${JSON.stringify([chainId, markee.toLowerCase(), hash, 'site', timestamp])}`
}
