// lib/github/linkedFiles.ts
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

// ── Delimiter helpers ─────────────────────────────────────────────────────────

export function startDelimiter(leaderboardAddress: string): string {
  return `<!-- MARKEE:START:${leaderboardAddress.toLowerCase()} -->`
}

export function endDelimiter(leaderboardAddress: string): string {
  return `<!-- MARKEE:END:${leaderboardAddress.toLowerCase()} -->`
}

// ── KV helpers ────────────────────────────────────────────────────────────────

export async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`
  const raw = await kv.get(kvKey)
  if (!raw) return []
  if (Array.isArray(raw)) return raw as LinkedFile[]
  // Legacy single-object migration — treat as verified since old route verified push access
  if (typeof raw === 'object' && raw !== null) {
    return legacyToArray(raw as Record<string, unknown>)
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as LinkedFile[]
      if (typeof parsed === 'object' && parsed !== null) return legacyToArray(parsed as Record<string, unknown>)
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

export async function saveLinkedFiles(leaderboardAddress: string, files: LinkedFile[]): Promise<void> {
  await kv.set(
    `github:markee:${leaderboardAddress.toLowerCase()}`,
    files,
    { ex: 60 * 60 * 24 * 365 * 5 },
  )
}
