// lib/leaderboards/verificationStatus.ts
//
// Server-only, address-based "is this board verified" lookup: linked GitHub files and website
// verifiedUrls, both kept in KV by address however the board was created. Shared by
// /api/account/verification-status and the /1hive campaign route so they agree on what verified means.

import { kv } from '@vercel/kv'
import { getLinkedFilesBatch, type LinkedFile } from '@/lib/github/linkedFiles'

interface OiMeta {
  verifiedUrl?: string
  verifiedUrls?: string[]
}

export type VerificationStatus = Record<string, { verifiedUrls: string[]; linkedFiles: LinkedFile[] }>

/** Keyed by lowercased address. Callers pass lowercased, de-duplicated addresses. */
export async function verificationStatusFor(addresses: string[]): Promise<VerificationStatus> {
  if (addresses.length === 0) return {}

  const oiMetaKeys = addresses.map(a => `oi:meta:${a}`)
  const [linkedFilesPerAddr, oiMetas] = await Promise.all([
    getLinkedFilesBatch(addresses),
    kv.mget<(OiMeta | null)[]>(...oiMetaKeys),
  ])

  const result: VerificationStatus = {}
  addresses.forEach((addr, i) => {
    const meta = oiMetas[i]
    const verifiedUrls = Array.isArray(meta?.verifiedUrls) ? meta.verifiedUrls : meta?.verifiedUrl ? [meta.verifiedUrl] : []
    result[addr] = { verifiedUrls, linkedFiles: linkedFilesPerAddr[i] }
  })
  return result
}
