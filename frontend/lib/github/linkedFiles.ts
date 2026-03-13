// lib/github/linkedFiles.ts
//
// Shared helpers for reading/writing the LinkedFile[] array in Vercel KV.
// Imported by register-markee, repo-status, verify-markee-file, and update-markee-file.
// Lives outside the api/ directory so Next.js doesn't treat it as a route.

import { kv } from '@vercel/kv'

export interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl: string
  repoHtmlUrl: string
  filePath: string
  verified: boolean
  linkedByUid: string
  linkedAt: string
}

// ── getLinkedFiles ────────────────────────────────────────────────────────────
//
// Reads the LinkedFile[] array from KV, migrating the legacy single-object
// format stored by the old register-markee route.
//
// Legacy entries are treated as verified=true because the old route already
// verified push access before saving — the only thing the new format adds is
// delimiter verification, which we can't retroactively check.

export async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`

  // @vercel/kv auto-parses JSON, so raw will be an object/array, not a string
  const raw = await kv.get(kvKey)
  if (!raw) return []

  // New array format
  if (Array.isArray(raw)) return raw as LinkedFile[]

  // Legacy single-object (auto-parsed by @vercel/kv)
  if (typeof raw === 'object' && raw !== null) {
    return legacyToArray(raw as Record<string, unknown>)
  }

  // Paranoia: if somehow stored as a raw string, parse manually
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as LinkedFile[]
      if (typeof parsed === 'object' && parsed !== null) {
        return legacyToArray(parsed as Record<string, unknown>)
      }
    } catch { /* ignore */ }
  }

  return []
}

function legacyToArray(obj: Record<string, unknown>): LinkedFile[] {
  if (!obj.repoFullName) return []
  return [{
    repoFullName:  obj.repoFullName  as string,
    repoOwner:     (obj.repoOwner    ?? '') as string,
    repoName:      (obj.repoName     ?? '') as string,
    repoAvatarUrl: (obj.repoAvatarUrl ?? '') as string,
    repoHtmlUrl:   (obj.repoHtmlUrl  ?? '') as string,
    filePath:      (obj.filePath     ?? '') as string,
    verified:      true,
    linkedByUid:   (obj.linkedByUid  ?? '') as string,
    linkedAt:      (obj.linkedAt     ?? '') as string,
  }]
}

// ── saveLinkedFiles ───────────────────────────────────────────────────────────

export async function saveLinkedFiles(
  leaderboardAddress: string,
  files: LinkedFile[],
): Promise<void> {
  await kv.set(
    `github:markee:${leaderboardAddress.toLowerCase()}`,
    files,
    { ex: 60 * 60 * 24 * 365 * 5 }, // 5 years
  )
}
