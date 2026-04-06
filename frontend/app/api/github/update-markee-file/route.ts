// app/api/github/update-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import wcwidth from 'wcwidth'
import { getLinkedFiles, startDelimiter, endDelimiter } from '@/lib/github/linkedFiles'

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
  const words = str.split(' ')
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

// ── Billboard builder ────────────────────────────────────────────────────────

function buildMarkeeBlock(
  leaderboardAddress: string,
  message: string,
  ownerName: string | null,
  nextBuyPriceEth: string,
  leaderboardUrl: string,
): string {
  const border   = '═'.repeat(INNER)
  const blank    = `  ║ ${' '.repeat(INNER - 2)} ║`
  const hdrLines = HDR_LINES.map(h => `  ║ ${centerPad(h, INNER - 2)} ║`).join('\n')
  const msgLines = wrapMessage(message, MSG_WIDTH)
    .map(l => `  ║   ${padToWidth(l, MSG_WIDTH)}   ║`)
    .join('\n')
  const footer = `${nextBuyPriceEth} ETH to change`

  return `${startDelimiter(leaderboardAddress)}
\`\`\`
  ╔${border}╗
${hdrLines}
  ╠${border}╣
${blank}
${msgLines}
${blank}
  ╠${border}╣
  ║ ${centerPad(footer, INNER - 2)} ║
  ╚${border}╝
              │││                    │││
            ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
\`\`\`
[Support this repo by paying to change this message at markee.xyz](${leaderboardUrl})
${endDelimiter(leaderboardAddress)}`
}

function buildEmptyBlock(
  leaderboardAddress: string,
  minimumPriceEth: string,
  leaderboardUrl: string,
): string {
  return `${startDelimiter(leaderboardAddress)}
> 🪧 **[Markee](${leaderboardUrl})** — *This space is available.*
>
> *Be the first to buy a message for ${minimumPriceEth} ETH on the [Markee App](${leaderboardUrl}).*
${endDelimiter(leaderboardAddress)}`
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { leaderboardAddress } = (body ?? {}) as { leaderboardAddress?: string }
  if (!leaderboardAddress) return NextResponse.json({ error: 'Missing leaderboardAddress' }, { status: 400 })

  const normalizedAddress = leaderboardAddress.toLowerCase() as `0x${string}`
  console.log(`[update-markee-file] triggered for ${normalizedAddress}`)

  const linkedFiles = await getLinkedFiles(normalizedAddress)
  const verifiedFiles = linkedFiles.filter(f => f.verified)
  console.log(`[update-markee-file] linkedFiles=${linkedFiles.length} verified=${verifiedFiles.length}`)

  if (verifiedFiles.length === 0)
    return NextResponse.json({ error: 'No verified files linked to this leaderboard' }, { status: 404 })

  // Read top message from chain
  let topMessage = ''
  let topOwnerName: string | null = null
  let nextBuyPriceEth = '0.001'
  try {
    const [topAddresses, topFunds] = await client.readContract({
      address: normalizedAddress,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [1n],
    })
    const topAddr = topAddresses[0]
    const topFund = topFunds[0] ?? 0n
    console.log(`[update-markee-file] topAddr=${topAddr} topFund=${topFund}`)
    if (topAddr) {
      const [msg, name] = await Promise.all([
        client.readContract({ address: topAddr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' }),
        client.readContract({ address: topAddr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' }),
      ])
      topMessage      = msg  ?? ''
      topOwnerName    = name || null
      nextBuyPriceEth = formatEther(topFund + BigInt('1000000000000000'))
      console.log(`[update-markee-file] topMessage="${topMessage.slice(0, 60)}"`)
    }
  } catch (err) {
    console.error('[update-markee-file] chain read error:', err)
    return NextResponse.json({ error: `Chain read failed: ${String(err)}` }, { status: 500 })
  }

  const leaderboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github/${normalizedAddress}`
  const markeeBlock = topMessage
    ? buildMarkeeBlock(normalizedAddress, topMessage, topOwnerName, nextBuyPriceEth, leaderboardUrl)
    : buildEmptyBlock(normalizedAddress, nextBuyPriceEth, leaderboardUrl)

  const START = startDelimiter(normalizedAddress)
  const END   = endDelimiter(normalizedAddress)

  const results: Array<{ filePath: string; repoFullName: string; success: boolean; error?: string }> = []

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
        `https://api.github.com/repos/${file.repoFullName}/contents/${encodeURIComponent(file.filePath)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
      )
      if (!fileRes.ok) {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: `Fetch failed (${fileRes.status})` })
        continue
      }

      const fileData = await fileRes.json()
      const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')

      const startIdx = currentContent.indexOf(START)
      const endIdx   = currentContent.indexOf(END)

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: 'Address-specific delimiters not found in file' })
        continue
      }

      const updated = currentContent.slice(0, startIdx) + markeeBlock + currentContent.slice(endIdx + END.length)

      const putRes = await fetch(
        `https://api.github.com/repos/${file.repoFullName}/contents/${encodeURIComponent(file.filePath)}`,
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

  return NextResponse.json({ success: results.some(r => r.success), results })
}
