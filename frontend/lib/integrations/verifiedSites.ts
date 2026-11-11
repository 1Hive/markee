'use client'
// Whether a URL someone is about to verify is on a domain already verified for the board. Sites are
// counted and listed one per domain (lib/integrations/featured.ts onePerDomain), so another page on a
// verified domain adds nothing.

import { useEffect, useState } from 'react'
import { normalizeHost } from '@/lib/views/host'

/** The verified URL on the same domain as `input`, or null. */
export function verifiedOnSameDomain(input: string, verifiedUrls: readonly string[]): string | null {
  const host = input.trim() ? normalizeHost(input) : null
  if (!host || !host.includes('.')) return null
  return verifiedUrls.find(url => normalizeHost(url) === host) ?? null
}

/** The note shown under a URL input when its domain is already verified. */
export function alreadyVerifiedNote(input: string): string {
  const host = normalizeHost(input) ?? input
  return `${host} is already verified for this board. Views from every page on ${host} count toward it, so you don't need to verify another page.`
}

/** A board's verified site URLs (empty until loaded or when it has none). */
export function useVerifiedSiteUrls(board: string | undefined): string[] {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    if (!board) return
    const addr = board.toLowerCase()
    let live = true
    fetch('/api/account/verification-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: [addr] }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (live) setUrls((data?.[addr]?.verifiedUrls as string[] | undefined) ?? []) })
      .catch(() => {})
    return () => { live = false }
  }, [board])
  return urls
}
