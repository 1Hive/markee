// Signed by a board owner (on-chain admin or creator) to unlink one of its GitHub files, so nobody
// else can strip a board's integrations. Shared by /api/github/unlink-markee-file and its callers.
export function unlinkFileMessage(chainId: number | string, board: string, repoFullName: string, filePath: string, timestamp: number): string {
  return `markee-github:unlink:${chainId}:${board.toLowerCase()}:${repoFullName}:${filePath}:${timestamp}`
}
