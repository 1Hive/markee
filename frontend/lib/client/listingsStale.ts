// After a transaction or verification anywhere in the app, the next /account load should skip the
// shared listing cache (60 s fresh, 5 min stale), or the Creator Hub keeps showing the board as it
// was. Per browser tab, and short-lived: a fresh read is only needed once.

const KEY = 'markee:listings-stale-until'
const WINDOW_MS = 5 * 60_000

export function markListingsStale(): void {
  try { sessionStorage.setItem(KEY, String(Date.now() + WINDOW_MS)) } catch { /* storage unavailable */ }
}

/** Whether a change was made recently in this tab; clears the flag, so one fresh read follows each change. */
export function takeListingsStale(): boolean {
  try {
    const until = Number(sessionStorage.getItem(KEY) ?? 0)
    sessionStorage.removeItem(KEY)
    return until > Date.now()
  } catch {
    return false
  }
}
