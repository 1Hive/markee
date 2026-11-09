import { kv } from '@vercel/kv'
import { createPublicClient, http, formatEther, isAddress, parseAbi } from 'viem'
import { FACTORIES } from '@/lib/contracts/addresses'
import { base } from 'viem/chains'
import { billboardLine } from '@/lib/github/billboardText'
import { getLinkedFiles, startDelimiter, endDelimiter, legacyAddressesFor, encodedFilePath } from '@/lib/github/linkedFiles'

// ── Inline wcwidth — counts display columns for Unicode/emoji strings ─────────
// Emoji and CJK characters occupy 2 columns; everything else occupies 1.
function wcwidth(str: string): number {
  let w = 0
  for (const cp of [...str]) {
    const c = cp.codePointAt(0) ?? 0
    if (
      (c >= 0x1100  && c <= 0x115F)  ||
      (c >= 0x2E80  && c <= 0x303E)  ||
      (c >= 0x3040  && c <= 0x33FF)  ||
      (c >= 0x3400  && c <= 0x4DBF)  ||
      (c >= 0x4E00  && c <= 0xA4CF)  ||
      (c >= 0xA960  && c <= 0xA97F)  ||
      (c >= 0xAC00  && c <= 0xD7FF)  ||
      (c >= 0xF900  && c <= 0xFAFF)  ||
      (c >= 0xFE10  && c <= 0xFE19)  ||
      (c >= 0xFE30  && c <= 0xFE6F)  ||
      (c >= 0xFF00  && c <= 0xFF60)  ||
      (c >= 0xFFE0  && c <= 0xFFE6)  ||
      (c >= 0x1B000 && c <= 0x1B0FF) ||
      (c >= 0x1F004 && c <= 0x1F0CF) ||
      (c >= 0x1F200 && c <= 0x1F2FF) ||
      (c >= 0x1F300 && c <= 0x1F9FF) ||
      (c >= 0x20000 && c <= 0x2FFFD) ||
      (c >= 0x30000 && c <= 0x3FFFD)
    ) { w += 2 } else { w += 1 }
  }
  return w
}

const client = createPublicClient({
  chain: base,
  transport: http(process.env.ALCHEMY_BASE_URL ?? undefined),
})

const LEADERBOARD_ABI = [
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const BOARD_STATE_ABI = [
  { inputs: [], name: 'VERSION', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumMonthlyRate', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'topMarkee', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'topRate', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

const OVERTAKE_INCREMENT = 1_000_000_000_000_000n
const SECONDS_PER_MONTH = 2_628_000n
const DISPLAY_STEP = 100_000_000_000_000n

export function formatEthCeil(wei: bigint): string {
  const rounded = ((wei + DISPLAY_STEP - 1n) / DISPLAY_STEP) * DISPLAY_STEP
  return formatEther(rounded)
}

export function fixedFooter(topFund: bigint, minimumPrice: bigint, hasMessage: boolean): string {
  if (!hasMessage) return `Add your message for ${formatEthCeil(minimumPrice > 0n ? minimumPrice : OVERTAKE_INCREMENT)} ETH`
  const next = topFund + OVERTAKE_INCREMENT
  return `${formatEthCeil(next > minimumPrice ? next : minimumPrice)} ETH to change`
}

export function streamingFooter(topRate: bigint, minimumMonthlyRate: bigint, hasMessage: boolean): string {
  if (!hasMessage) return `Stream from ${formatEthCeil(minimumMonthlyRate)} ETH/mo to add yours`
  return `Stream over ${formatEthCeil(topRate * SECONDS_PER_MONTH)} ETH/mo to change`
}

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name',    outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

// ── Billboard constants ──────────────────────────────────────────────────────

const INNER = 54  // columns between ║ and ║ (border = INNER ═ chars)
const MSG_WIDTH = INNER - 6  // usable message width (3-space margins each side)

const HDR_LINES = [
  '⡷⢾ ⣎⣱ ⣏⡱ ⣇⠜ ⣏⡉ ⣏⡉',
  '⠇⠸ ⠇⠸ ⠇⠱ ⠇⠱ ⠧⠤ ⠧⠤',
]

// ── Text helpers ─────────────────────────────────────────────────────────────

function padToWidth(str: string, width: number): string {
  const dw = wcwidth(str)
  return str + ' '.repeat(Math.max(0, width - dw))
}

function centerPad(str: string, width: number): string {
  const dw = wcwidth(str)
  const tot = Math.max(0, width - dw)
  const left = Math.floor(tot / 2)
  return ' '.repeat(left) + str + ' '.repeat(tot - left)
}

function wrapMessage(str: string, maxWidth: number): string[] {
  const words = billboardLine(str).split(' ')
  const lines: string[] = []
  let current = ''
  let currentWidth = 0

  for (const word of words) {
    // Hard-slice any single word that exceeds maxWidth
    const chunks: string[] = []
    let remaining = word
    while (wcwidth(remaining) > maxWidth) {
      let slice = ''
      let sliceWidth = 0
      for (const char of [...remaining]) {
        const cw = wcwidth(char)
        if (sliceWidth + cw > maxWidth) break
        slice += char
        sliceWidth += cw
      }
      chunks.push(slice)
      remaining = remaining.slice(slice.length)
    }
    if (remaining) chunks.push(remaining)

    for (const chunk of chunks) {
      const chunkWidth = wcwidth(chunk)
      if (currentWidth === 0) {
        current = chunk
        currentWidth = chunkWidth
      } else if (currentWidth + 1 + chunkWidth <= maxWidth) {
        current += ' ' + chunk
        currentWidth += 1 + chunkWidth
      } else {
        lines.push(current)
        current = chunk
        currentWidth = chunkWidth
      }
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

// ── Billboard builder (shared structure) ─────────────────────────────────────

function buildBillboard(
  leaderboardAddress: string,
  message: string,
  footerText: string,
  leaderboardUrl: string,
): string {
  const border   = '═'.repeat(INNER)
  const blank    = `  ║ ${' '.repeat(INNER - 2)} ║`
  // Header padding is hardcoded (left=18, right=17) rather than computed:
  // braille chars render slightly wider than 1 col in GitHub's code font,
  // so centerPad over-pads the right side by ~2 spaces.
  const hdrLines = HDR_LINES.map(h => `  ║                  ${h}                 ║`).join('\n')
  const msgLines = wrapMessage(message, MSG_WIDTH)
    .map(l => `  ║   ${padToWidth(l, MSG_WIDTH)}   ║`)
    .join('\n')

  return `${startDelimiter(leaderboardAddress)}
\`\`\`
  ╔${border}╗
${hdrLines}
  ╠${border}╣
${blank}
${msgLines}
${blank}
  ╠${border}╣
  ║ ${centerPad(footerText, INNER - 2)} ║
  ╚${border}╝
                 ││                      ││
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
\`\`\`
*Show the world you support this repo! [Change this message at markee.xyz](${leaderboardUrl}) ^*
${endDelimiter(leaderboardAddress)}`
}

const FACTORY_ABI = parseAbi(['function isFactoryLeaderboard(address) view returns (bool)'])
const BOARD_FACTORIES = [...new Set(
  [...Object.values(FACTORIES), '0x37f420fdE5c98e611EB7cb9b74ef579D84697039', process.env.NEXT_PUBLIC_STREAMING_FACTORY ?? '']
    .filter(a => isAddress(a)).map(a => a.toLowerCase()),
)] as `0x${string}`[]

export async function isLiveBoard(address: string): Promise<boolean | null> {
  const reads = await client.multicall({
    contracts: BOARD_FACTORIES.map(factory => ({ address: factory, abi: FACTORY_ABI, functionName: 'isFactoryLeaderboard' as const, args: [address as `0x${string}`] })),
  })
  if (reads.some(r => r.status === 'success' && r.result === true)) return true
  return reads.every(r => r.status === 'success') ? false : null
}

export interface BillboardState { message: string; footer: string }

export async function readBillboardState(board: `0x${string}`): Promise<BillboardState> {
  const version = await client.readContract({ address: board, abi: BOARD_STATE_ABI, functionName: 'VERSION' }).catch(() => '')
  if (version.startsWith('streaming')) {
    const [top, topRate, minimumMonthlyRate] = await Promise.all([
      client.readContract({ address: board, abi: BOARD_STATE_ABI, functionName: 'topMarkee' }),
      client.readContract({ address: board, abi: BOARD_STATE_ABI, functionName: 'topRate' }),
      client.readContract({ address: board, abi: BOARD_STATE_ABI, functionName: 'minimumMonthlyRate' }),
    ])
    const message = top && !/^0x0{40}$/i.test(top) ? await client.readContract({ address: top, abi: MARKEE_ABI, functionName: 'message' }) : ''
    const hasMessage = !!billboardLine(message) && topRate > 0n
    return { message: hasMessage ? message : '', footer: streamingFooter(topRate, minimumMonthlyRate, hasMessage) }
  }
  const [[topAddresses, topFunds], minimumPrice] = await Promise.all([
    client.readContract({ address: board, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees', args: [1n] }),
    client.readContract({ address: board, abi: BOARD_STATE_ABI, functionName: 'minimumPrice' }).catch(() => 0n),
  ])
  const topAddr = topAddresses[0]
  const message = topAddr ? await client.readContract({ address: topAddr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' }) : ''
  const hasMessage = !!billboardLine(message)
  return { message: hasMessage ? message : '', footer: fixedFooter(topFunds[0] ?? 0n, minimumPrice, hasMessage) }
}

export function billboardFor(board: string, state: BillboardState, leaderboardUrl: string): string {
  return buildBillboard(board, state.message || 'This space is available!', state.footer, leaderboardUrl)
}

export function billboardSignature(state: BillboardState): string {
  return `${billboardLine(state.message)}\u0000${state.footer}`
}

export interface SyncOutcome { status: number; body: Record<string, unknown> }

export async function syncMarkeeFile(normalizedAddress: `0x${string}`): Promise<SyncOutcome> {
  console.log(`[update-markee-file] triggered for ${normalizedAddress}`)

  const linkedFiles = await getLinkedFiles(normalizedAddress)
  const verifiedFiles = linkedFiles.filter(f => f.verified)
  console.log(`[update-markee-file] linkedFiles=${linkedFiles.length} verified=${verifiedFiles.length}`)

  if (verifiedFiles.length === 0)
    return { status: 404, body: { error: 'No verified files linked to this leaderboard' } }

  let state: BillboardState
  try {
    state = await readBillboardState(normalizedAddress)
  } catch (err) {
    console.error('[update-markee-file] chain read error:', err)
    return { status: 500, body: { error: 'Chain read failed' } }
  }

  const leaderboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/markee/${normalizedAddress}`
  const markeeBlock = billboardFor(normalizedAddress, state, leaderboardUrl)

  const START = startDelimiter(normalizedAddress)
  const END   = endDelimiter(normalizedAddress)

  const results: Array<{ filePath: string; repoFullName: string; success: boolean; unchanged?: boolean; error?: string }> = []

  for (const file of verifiedFiles) {
    console.log(`[update-markee-file] processing ${file.repoFullName}/${file.filePath} linkedByUid=${file.linkedByUid || '(empty)'}`)
    let accessToken: string | null = null
    if (file.linkedByUid) {
      const raw = await kv.get(`github:user:${file.linkedByUid}`)
      if (raw) {
        const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
        accessToken = data?.accessToken ?? null
      }
      console.log(`[update-markee-file] token lookup uid=${file.linkedByUid} found=${!!accessToken}`)
    } else {
      console.warn(`[update-markee-file] linkedByUid is empty for ${file.repoFullName}/${file.filePath} — cannot look up token`)
    }

    if (!accessToken) {
      results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: `GitHub token not found (linkedByUid="${file.linkedByUid || ''}")` })
      continue
    }

    try {
      const fileRes = await fetch(
        `https://api.github.com/repos/${file.repoFullName}/contents/${encodedFilePath(file.filePath)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
      )
      if (!fileRes.ok) {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: `Fetch failed (${fileRes.status})` })
        continue
      }

      const fileData = await fileRes.json()
      const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')

      let startIdx = currentContent.indexOf(START)
      let endIdx   = currentContent.indexOf(END)
      let foundEnd = END

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        // Fall back to known legacy addresses from the migration map
        for (const oldAddr of legacyAddressesFor(normalizedAddress)) {
          const legacyStart = startDelimiter(oldAddr)
          const legacyEnd   = endDelimiter(oldAddr)
          const si = currentContent.indexOf(legacyStart)
          const ei = currentContent.indexOf(legacyEnd)
          if (si !== -1 && ei !== -1 && ei > si) {
            startIdx = si
            endIdx   = ei
            foundEnd = legacyEnd
            break
          }
        }
      }

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        const startMatch = /<!-- MARKEE:START:(0x[0-9a-fA-F]{40}) -->/.exec(currentContent)
        if (startMatch && startMatch[1].toLowerCase() !== normalizedAddress && await isLiveBoard(startMatch[1]) === false) {
          const anyEnd = endDelimiter(startMatch[1])
          const si = currentContent.indexOf(startMatch[0])
          const ei = currentContent.indexOf(anyEnd)
          if (si !== -1 && ei !== -1 && ei > si) {
            startIdx = si
            endIdx   = ei
            foundEnd = anyEnd
          }
        }
      }

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: 'Address-specific delimiters not found in file' })
        continue
      }

      const updated = currentContent.slice(0, startIdx) + markeeBlock + currentContent.slice(endIdx + foundEnd.length)
      if (updated === currentContent) {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: true, unchanged: true })
        continue
      }

      const putRes = await fetch(
        `https://api.github.com/repos/${file.repoFullName}/contents/${encodedFilePath(file.filePath)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'markee: update sponsored message',
            content: Buffer.from(updated).toString('base64'),
            sha:     fileData.sha,
          }),
        }
      )

      if (!putRes.ok) {
        const errBody = await putRes.text()
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: `Write failed (${putRes.status}): ${errBody.slice(0, 200)}` })
      } else {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: true })
      }
    } catch (err) {
      results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: String(err) })
    }
  }

  const succeeded = results.filter(r => r.success)
  const failed    = results.filter(r => !r.success)
  const delimiterFails = failed.filter(r => r.error?.toLowerCase().includes('delimiter'))

  let topLevelError: string | undefined
  if (succeeded.length === 0) {
    if (delimiterFails.length > 0 && delimiterFails.length === failed.length) {
      const names = delimiterFails.map(r => r.filePath).join(', ')
      topLevelError = `Delimiters not found in ${names} — add the snippet from the Embed panel to your file, then sync again`
    } else {
      topLevelError = failed[0]?.error ?? 'Sync failed'
    }
  }

  return { status: 200, body: { success: succeeded.length > 0, results, ...(topLevelError ? { error: topLevelError } : {}) } }
}
