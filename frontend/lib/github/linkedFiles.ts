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

// Case-insensitive delimiter match for one specific address. Deliberately does NOT fall back to
// "any address-shaped delimiter pair" -- that accepted a completely unrelated project's delimiters
// (or a typo'd/wrong address) as valid verification for this leaderboard. Legacy migration aliases
// are handled by the caller via legacyAddressesFor(), not by this function.
export function hasDelimiterPair(content: string, leaderboardAddress: string): boolean {
  const addr = leaderboardAddress.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = new RegExp(`<!--\\s*MARKEE:START:${addr}\\s*-->`, 'i')
  const end = new RegExp(`<!--\\s*MARKEE:END:${addr}\\s*-->`, 'i')
  return start.test(content) && end.test(content)
}

// Maps current GitHub leaderboard addresses → their old predecessor address(es).
// All addresses lowercase. Used to grandfather in pre-migration delimiters.
// v1.1 → v1.0 pairs (original migration)
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
  // v1.3 → [v1.1, v1.0] pairs (v1.1→v1.3 migration — from markee-migrations.csv)
  '0x43d025ea7f0bfcc508c5dc1708415fe2e41c464a': ['0xc6c2e9efb898a42db4137b07b727b45e0c353d81', '0xb974d9df9b6302ff99b9cc18b1a14ff363aaee21'], // pglavin2/honeyswap-interface
  '0x5e2d08d07b2c771abe15af29fb30826bfeef2151': ['0xaf4401e765dff079ab6021bbb8d46e53e27613db', '0x670986ce867674b280b19b0e406c840113224fb6'], // 1Hive/markee
  '0x0ed8e4f89b2e7ebdbc7ba2f1bf7d1f9012f00746': ['0xd7a3d3a7dd35b8e81fc0b83c032d0ed3261417d9', '0x2335bfa938b60c73f0a1d62c6ecc747e8c516d2c'], // 1Hive/gardens-v2
  '0xe871f0282224ef727bfc69fc54ec3ebe2908f489': ['0x98d67f2a45af911798ff1e094520da12c3faa9dd', '0xd5e62eac5e144a0cb09774ae9285d50e88667dae'], // web3devz/VeriNet
  '0xce0b603d7d72cd665e7bf917a339d1b8585a61c1': ['0xec11eea22dcaa37a31b441fb7d2b503e842f6e50', '0x6061c7e557ccce69ba804aeba43a9cd7aa157078'], // bitpixi2/deviantclaw
  '0xee3c567b5ff302d7a0d8a3105a911804da576cf9': ['0x135f95b3b4676ffda0b86f7575eab59ee1f3f501', '0x254a9ced62b214ee1998c7c7934ee25a57e3fbf9'], // JimmyNagles/AVN #1
  '0xb57d3a145cb0245f598cda68a676eeb0a4333b2b': ['0x98d67f2a45af911798ff1e094520da12c3faa9dd', '0x61bac5ddca2519c94b1ac9eb3e9e563b4375729b'], // web3devz/agentcred
  '0xc2a42b3edbfcdfa3c64108336a7f3492a3aca887': ['0xdfd9945e82ae729deabdb0c1d57a16fb884cad83', '0x253e91dcc7bd56e3695348c3bb0bc9febf6f01b5'], // Timidan/synth-x
  '0x1e95812f4ce5178339d55d17727e7355a4ced67b': ['0xf26a8e70ac16626400556bd21c1de5ef46e415a6', '0x57f50086e359d24cc65bcc5614e30123ef39ec76'], // nativ3ai/hermes
  '0x029bcbce4b21be6e9686993616965eade321de37': ['0xd68d8c09a1067814de8b08eca443b0595a2b48ba', '0x7858da9eae7c811c71c2eeaa9948c5ef570c43a2'], // JimmyNagles/AVN #2
  '0x8aa3136d599886910cbde882268c4f276ccfe6f6': ['0x98d67f2a45af911798ff1e094520da12c3faa9dd', '0x3718f5b053e8427df99c486cb5a6e60066345223'], // web3devz/Soulbyte
  '0xcb4108cb6900a09a51176ef1f1ec9b1141d7179f': ['0x022a49df8aae2f38491800019a0b25c615fb0172', '0x284e7c8d31f0235230e549d475591ad91b0c12b9'], // web3sim/PolicyPay
  '0x0b63a27f25d69c0fc636eccf7b5f338206bb9e40': ['0xefb17b8f14f013aa18d9e6f110ccdbfc4dfb3298', '0x6459b0b0a3f8c19cb28464b248dff6a8cc8ca210'], // web3sim/HelixChain
}

export function legacyAddressesFor(newAddress: string): string[] {
  return GITHUB_NEW_TO_OLD[newAddress.toLowerCase()] ?? []
}

// ── GitHub content fetch (with timeout) ─────────────────────────────────────
// Both register-markee and verify-markee-file fetch the file's raw content to check for the
// delimiter pair. Neither had a timeout, so a slow/hanging GitHub response surfaced only as a
// generic "Network error" after however long the platform's own function timeout took to kill it --
// this bounds it to a few seconds and lets the caller tell "GitHub took too long" apart from "the
// file/repo genuinely doesn't exist or isn't accessible."
export type GithubFileFetchResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'not_found'; status: number }

// Encodes "owner/repo" into a safe URL path. Callers pass repoFullName straight from the request
// body, so a crafted value (query strings, "..", extra slashes) must not reshape the outbound
// api.github.com path. A name that isn't exactly two non-empty segments can't be a real repo,
// which is why the fetch below reports it as not_found.
function encodedRepoPath(repoFullName: string): string | null {
  const [owner, repo, ...rest] = repoFullName.split('/')
  if (!owner || !repo || rest.length > 0) return null
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export async function fetchGithubFileContent(
  repoFullName: string,
  filePath: string,
  token: string,
  timeoutMs = 8000,
): Promise<GithubFileFetchResult> {
  const repoPath = encodedRepoPath(repoFullName)
  if (!repoPath) return { ok: false, reason: 'not_found', status: 404 }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repoPath}/contents/${encodeURIComponent(filePath)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' }, signal: controller.signal },
    )
    if (!res.ok) return { ok: false, reason: 'not_found', status: res.status }
    return { ok: true, content: await res.text() }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, reason: 'timeout' }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── KV helpers ────────────────────────────────────────────────────────────────

function normalize(raw: unknown): LinkedFile[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as LinkedFile[]
  if (typeof raw === 'object') return legacyToArray(raw as Record<string, unknown>)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as LinkedFile[]
      if (typeof parsed === 'object' && parsed !== null) return legacyToArray(parsed as Record<string, unknown>)
    } catch { /* ignore */ }
  }
  return []
}

// One MGET for many addresses. Goes through the Upstash REST API rather than kv.mget so the
// strong-consistency header is preserved -- read replica lag makes verified status flicker on
// page refresh, which is why this path never used the pooled client in the first place.
async function readLinkedFilesFromKV(addrs: string[]): Promise<LinkedFile[][]> {
  if (addrs.length === 0) return []
  try {
    const res = await fetch(`${process.env.KV_REST_API_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Upstash-Consistency': 'strong',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['MGET', ...addrs.map(a => `github:markee:${a}`)]),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[getLinkedFiles] Upstash REST error ${res.status} for ${addrs.length} key(s)`)
      return addrs.map(() => [])
    }
    const json = await res.json()
    const results: unknown[] = Array.isArray(json.result) ? json.result : []
    return addrs.map((_, i) => normalize(results[i]))
  } catch (err) {
    console.error('[getLinkedFiles] Upstash REST fetch failed:', err)
    return addrs.map(() => [])
  }
}

// Batched form of getLinkedFiles. Two round trips regardless of address count (one for the current
// keys, one more only if some addresses missed and have legacy predecessors) instead of one per
// address, which mattered once callers started passing 200 boards at a time.
export async function getLinkedFilesBatch(leaderboardAddresses: readonly string[]): Promise<LinkedFile[][]> {
  const addrs = leaderboardAddresses.map(a => a.toLowerCase())
  const current = await readLinkedFilesFromKV(addrs)

  // Fall back to legacy predecessor addresses (v1.0→v1.1 and v1.2→v1.3 migrations).
  // On first hit, lazily migrate the data to the current address key so future
  // reads are fast and don't need to check legacy keys.
  const legacyLookups = addrs.flatMap((addr, i) =>
    current[i].length > 0 ? [] : legacyAddressesFor(addr).map(legacyAddr => ({ i, addr, legacyAddr })),
  )
  if (legacyLookups.length === 0) return current

  const legacyFiles = await readLinkedFilesFromKV(legacyLookups.map(l => l.legacyAddr))
  const migrations: Promise<void>[] = []
  legacyLookups.forEach(({ i, addr }, j) => {
    if (current[i].length > 0 || legacyFiles[j].length === 0) return
    current[i] = legacyFiles[j]
    migrations.push(saveLinkedFiles(addr, legacyFiles[j]))
  })
  await Promise.all(migrations)

  return current
}

export async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  return (await getLinkedFilesBatch([leaderboardAddress]))[0]
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
