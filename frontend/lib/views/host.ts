// Bare hostname, lowercased, no protocol/path/www — the key both the POST increment and the GET
// per-URL lookup normalize to, so "https://Example.com/blog" and "example.com" count together.
export function normalizeHost(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 253) // longest valid hostname
  if (!trimmed) return null
  try {
    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}
