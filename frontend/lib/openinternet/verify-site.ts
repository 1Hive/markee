// Signed by the board admin to attach a verified site to its board through /api/openinternet/verify-url.
export function siteVerifyMessage(chainId: number | string, board: string, url: string, timestamp: number): string {
  return `markee-site:verify:${JSON.stringify([String(chainId), board.toLowerCase(), url, timestamp])}`
}
