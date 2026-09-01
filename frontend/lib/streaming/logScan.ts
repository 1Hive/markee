export const LOG_CHUNK = 9_000n            // stay under provider getLogs range caps
export const LOG_LOOKBACK_BLOCKS = 50_000n // ~1.15 days of Base blocks

// Without STREAMING_FROM_BLOCK (the factory deploy block) the window is bounded and incomplete:
// a backer whose last stream change predates it is missed.
export function resolveScanFromBlock(latestBlock: bigint): bigint {
  const configured = process.env.STREAMING_FROM_BLOCK
  if (configured) return BigInt(configured)
  return latestBlock > LOG_LOOKBACK_BLOCKS ? latestBlock - LOG_LOOKBACK_BLOCKS : 0n
}

type LogsClient = { getLogs(args: unknown): Promise<unknown[]> }

export async function getLogsChunked(
  client: LogsClient,
  filter: Record<string, unknown>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ logs: unknown[]; failedChunks: number }> {
  const logs: unknown[] = []
  let failedChunks = 0
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK + 1n) {
    const end = start + LOG_CHUNK < toBlock ? start + LOG_CHUNK : toBlock
    try {
      logs.push(...await client.getLogs({ ...filter, fromBlock: start, toBlock: end }))
    } catch {
      failedChunks++
    }
  }
  return { logs, failedChunks }
}
