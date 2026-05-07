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

// Maps new v1.1 GitHub leaderboard addresses → their old v1.0 predecessor(s).
// All addresses lowercase. Used to grandfather in pre-migration delimiters.
const GITHUB_NEW_TO_OLD: Record<string, string[]> = {
  '0xc6c2e9efb898a42db4137b07b727b45e0c353d81': ['0xb974d9df9b6302ff99b9cc18b1a14ff363aaee21'],
  '0xaf4401e765dff079ab6021bbb8d46e53e27613db': ['0x670986ce867674b280b19b0e406c840113224fb6'],
  '0xd7a3d3a7dd35b8e81fc0b83c032d0ed3261417d9': ['0x2335bfa938b60c73f0a1d62c6ecc747e8c516d2c'],
  '0x98d67f2a45af911798ff1e094520da12c3faa9dd': ['0xd5e62eac5e144a0cb09774ae9285d50e88667dae', '0x61bac5ddca2519c94b1ac9eb3e9e563b4375729b', '0x3718f5b053e8427df99c486cb5a6e60066345223'],
  '0xec11eea22dcaa37a31b441fb7d2b503e842f6e50': ['0x6061c7e557ccce69ba804aeba43a9cd7aa157078'],
  '0x135f95b3b4676ffda0b86f7575eab59ee1f3f501': ['0x254a9ced62b214ee1998c7c7934ee25a57e3fbf9'],
  '0xdfd9945e82ae729deabdb0c1d57a16fb884cad83': ['0x253e91dcc7bd56e3695348c3bb0bc9febf6f01b5'],
  '0xf26a8e70ac16626400556bd21c1de5ef46e415a6': ['0x57f50086e359d24cc65bcc5614e30123ef39ec76'],
  '0xd68d8c09a1067814de8b08eca443b0595a2b48ba': ['0x7858da9eae7c811c71c2eeaa9948c5ef570c43a2'],
  '0x022a49df8aae2f38491800019a0b25c615fb0172': ['0x284e7c8d31f0235230e549d475591ad91b0c12b9'],
  '0xefb17b8f14f013aa18d9e6f110ccdbfc4dfb3298': ['0x6459b0b0a3f8c19cb28464b248dff6a8cc8ca210'],
}

export function legacyAddressesFor(newAddress: string): string[] {
  return GITHUB_NEW_TO_OLD[newAddress.toLowerCase()] ?? []
}

// ── KV helpers ────────────────────────────────────────────────────────────────

export async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${leaderboardAddress.toLowerCase()}`

  // Use Upstash REST API directly with strong consistency to avoid
  // read replica lag causing verified status to flicker on page refresh
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(kvKey)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Upstash-Consistency': 'strong',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    console.error(`[getLinkedFiles] Upstash REST error ${res.status} for key ${kvKey}`)
    return []
  }

  const json = await res.json()
  const raw = json.result

  if (!raw) return []
  if (Array.isArray(raw)) return raw as LinkedFile[]
  if (typeof raw === 'object' && raw !== null) return legacyToArray(raw as Record<string, unknown>)
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
