// Shared HTML tag verification primitive.
// Fetches a URL's raw server-rendered HTML and checks for the
// data-markee-address attribute matching the given contract address.

export async function checkHtmlTag(
  address: string,
  url: string,
): Promise<{ verified: boolean; error?: string }> {
  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Markee-Verifier/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return { verified: false, error: `Could not fetch URL (HTTP ${res.status})` }
    }
    html = await res.text()
  } catch {
    return { verified: false, error: 'Could not reach that URL. Is it publicly accessible?' }
  }

  const normalizedAddress = address.toLowerCase()
  const hasDataAttr = new RegExp(`data-markee-address=["']${normalizedAddress}["']`, 'i').test(html)

  if (!hasDataAttr) {
    return {
      verified: false,
      error: 'This Markee is not detected at this URL. See the integration guide to add it to your site.',
    }
  }

  return { verified: true }
}
