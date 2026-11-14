// Signed by the board admin (its current on-chain admin()) so only the admin decides which GitHub
// files a board shows. Shared by /api/github/register-markee, /api/github/unlink-markee-file and their callers.
export function unlinkFileMessage(chainId: number | string, board: string, repoFullName: string, filePath: string, timestamp: number): string {
  return `markee-github:unlink:${chainId}:${board.toLowerCase()}:${repoFullName}:${filePath}:${timestamp}`
}

export function registerFileMessage(chainId: number | string, board: string, repoFullName: string, filePath: string, timestamp: number): string {
  return `markee-github:register:${JSON.stringify([String(chainId), board.toLowerCase(), repoFullName, filePath, timestamp])}`
}
