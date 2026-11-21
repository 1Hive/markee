// After a transaction or verification anywhere in the app, the next /account load should skip the
// shared listing cache (60 s fresh, 5 min stale), or the Creator Hub keeps showing the board as it
// was. Per browser tab, and short-lived: a fresh read is only needed once.

const KEY = 'markee:listings-stale-until'
const WINDOW_MS = 5 * 60_000

export function markListingsStale(): void {
  try { sessionStorage.setItem(KEY, String(Date.now() + WINDOW_MS)) } catch { /* storage unavailable */ }
}

/** Whether a change was made recently in this tab. Clear it once a fresh read has succeeded. */
export function peekListingsStale(): boolean {
  try { return Number(sessionStorage.getItem(KEY) ?? 0) > Date.now() } catch { return false }
}

export function clearListingsStale(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}
