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
  // v1.3 → v1.2 pairs (v1.2→v1.3 migration)
  '0x43d025ea7f0bfcc508c5dc1708415fe2e41c464a': ['0xdbb405000bcc0662b0d72f620acb91ec7e8dcaea'], // pglavin2/honeyswap-interface
  '0x5e2d08d07b2c771abe15af29fb30826bfeef2151': ['0x84bc9feff57ae16307a4a01b7babff05dbd6b4e1'], // 1Hive/markee
  '0x0ed8e4f89b2e7ebdbc7ba2f1bf7d1f9012f00746': ['0x172e45b38dc98a11299c3ff9a308f81132e0934c'], // 1Hive/gardens-v2
  '0xe871f0282224ef727bfc69fc54ec3ebe2908f489': ['0x0246c6dd1cd13e460dadac694cb4abbc8ed4b034'], // web3devz/VeriNet
  '0xce0b603d7d72cd665e7bf917a339d1b8585a61c1': ['0xb64aa75d72ecfc0009053852a656ec84ea65f30e'], // bitpixi2/deviantclaw
  '0xee3c567b5ff302d7a0d8a3105a911804da576cf9': ['0x23172551399f19a988a3df12680305ab2ca50214'], // JimmyNagles/AVN #1
  '0xb57d3a145cb0245f598cda68a676eeb0a4333b2b': ['0x688e6e140314dfdc6817420f27f29c97b5947171'], // web3devz/agentcred
  '0xc2a42b3edbfcdfa3c64108336a7f3492a3aca887': ['0x3569d07f2007ca4ac5ea4aed2f40f4a61255cfd1'], // Timidan/synth-x
  '0x1e95812f4ce5178339d55d17727e7355a4ced67b': ['0x8d0e06422bf9e860a9543abb64d5304eaeeff5e8'], // nativ3ai/hermes
  '0x029bcbce4b21be6e9686993616965eade321de37': ['0x64d232ef48580160663f96983f4ba2bad735c701'], // JimmyNagles/AVN #2
  '0x8aa3136d599886910cbde882268c4f276ccfe6f6': ['0x9dab2b08033268b0414016282152fcb82017fbc8'], // web3devz/Soulbyte
  '0xcb4108cb6900a09a51176ef1f1ec9b1141d7179f': ['0x98f4235fbe3a134b21ef75d6319bf5fc2fe8ccb0'], // web3sim/PolicyPay
  '0x0b63a27f25d69c0fc636eccf7b5f338206bb9e40': ['0x713af7f43d51470f0b9d40133203611ba729c596'], // web3sim/HelixChain
}

export function legacyAddressesFor(newAddress: string): string[] {
  return GITHUB_NEW_TO_OLD[newAddress.toLowerCase()] ?? []
}

// ── KV helpers ────────────────────────────────────────────────────────────────

async function readLinkedFilesFromKV(addr: string): Promise<LinkedFile[]> {
  const kvKey = `github:markee:${addr}`
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

export async function getLinkedFiles(leaderboardAddress: string): Promise<LinkedFile[]> {
  const addr = leaderboardAddress.toLowerCase()

  // Try current address first
  const files = await readLinkedFilesFromKV(addr)
  if (files.length > 0) return files

  // Fall back to legacy predecessor addresses (v1.0→v1.1 and v1.2→v1.3 migrations).
  // On first hit, lazily migrate the data to the current address key so future
  // reads are fast and don't need to check legacy keys.
  for (const legacyAddr of legacyAddressesFor(addr)) {
    const legacyFiles = await readLinkedFilesFromKV(legacyAddr)
    if (legacyFiles.length > 0) {
      await saveLinkedFiles(addr, legacyFiles)
      return legacyFiles
    }
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
