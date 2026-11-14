// Every v1.2+ Leaderboard's initialize() deploys a seed Markee owned by the creator with an empty
// message and no funds. Until someone writes on it or funds it, it is a placeholder, not a message.
// A funded Markee with an empty message belongs to a real buyer and stays listed.
export function isPlaceholderMarkee(m: { message: string; totalFunds: bigint; rate?: bigint }): boolean {
  return !m.message.trim() && m.totalFunds === 0n && (m.rate ?? 0n) === 0n
}
