// Only a path on the site that started sign-in is a valid place to land afterwards.
export function safeReturnPath(value: unknown, origin: string): string {
  if (typeof value !== 'string' || value.length > 2048) return ''
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return ''
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return ''
  let base: URL
  try { base = new URL(origin) } catch { return '' }
  let target: URL
  try { target = new URL(value, base) } catch { return '' }
  if (target.origin !== base.origin) return ''
  return `${target.pathname}${target.search}${target.hash}`
}
