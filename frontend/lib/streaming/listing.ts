// Which markees a Rent (streaming) board lists, shared by the board page (useStreamingMarkees) and
// the server-side lists in lib/streaming/messages.ts so every page shows the same messages.
//
// The list is getTopMarkees order (effective rate, descending), so a message whose funding ran out
// (rate 0) falls to the bottom and is shown dimmed with Reactivate. Zero-rate markees that were never
// backed at all are dropped: createMarkee runs before the stream-opening batchCall, so an abandoned or
// failed flow leaves a markee with a message but no history (and the genesis seed markee has neither).

// getTopMarkees limit; it clamps to the board's markee count.
export const BOARD_MESSAGE_LIMIT = 100

export function isListedStreamingMarkee(address: string, rate: bigint, everFunded: Set<string>): boolean {
  return rate > 0n || everFunded.has(address.toLowerCase())
}
