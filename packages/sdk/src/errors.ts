/** Wallet providers can reject with plain objects, including nested RPC errors. */
export function errorMessage(error: unknown): string {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  let message: string | undefined;
  for (let i = 0; pending.length && i < 20; i++) {
    const value = pending.shift();
    if (seen.has(value)) continue;
    seen.add(value);
    if (typeof value === 'string') {
      if (/user (?:rejected|denied)|rejected (?:by|from) (?:the )?user/i.test(value)) return 'Wallet request cancelled. You can try again when you’re ready.';
      if (value.trim() && value !== '[object Object]') message ??= value;
    } else if (value && typeof value === 'object') {
      const detail = value as Record<string, unknown>;
      if (detail.code === 4001 || detail.code === '4001' || detail.code === 'ACTION_REJECTED') return 'Wallet request cancelled. You can try again when you’re ready.';
      pending.push(...[detail.shortMessage, detail.message, detail.cause, detail.error, detail.data, detail.originalError].filter(item => item != null));
    }
  }
  return message ?? 'This request could not be completed. Please try again.';
}
