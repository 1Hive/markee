export function boardPolicyMessage(board: string, policy: unknown, timestamp: number) {
  return `markee:board-moderation:v1:${JSON.stringify([8453, board.toLowerCase(), policy, timestamp])}`
}
