// frontend/app/api/github/update-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({ chain: base, transport: http() })

const LEADERBOARD_ABI = [
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const START_DELIMITER = '<!-- MARKEE:START -->'
const END_DELIMITER = '<!-- MARKEE:END -->'

function buildMarkeeBlock(
  message: string,
  ownerName: string | null,
  nextBuyPriceEth: string,
  leaderboardUrl: string,
): string {
  const attribution = ownerName ? `\n> — ${ownerName}\n` : '\n'
  return `${START_DELIMITER}
> ${message}
${attribution}
*This message was bought on [Markee](https://markee.xyz). Currently costs ${nextBuyPriceEth} ETH to change — [take the top spot](${leaderboardUrl}).*
${END_DELIMITER}`
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { leaderboardAddress, message, ownerName } = body ?? {}

  if (!leaderboardAddress || !message) {
    return NextResponse.json({ error: 'Missing leaderboardAddress or message' }, { status: 400 })
  }

  const normalizedAddress = (leaderboardAddress as string).toLowerCase()

  // ── Look up verified repo metadata ────────────────────────────────────────
  const repoMeta = await kv.get<string>(`github:markee:${normalizedAddress}`)
  if (!repoMeta) {
    return NextResponse.json({ error: 'No verified repo linked to this leaderboard' }, { status: 404 })
  }

  const { repoFullName, filePath, linkedByUid } = typeof repoMeta === 'string'
    ? JSON.parse(repoMeta)
    : repoMeta

  // ── Look up the access token of whoever registered the repo ───────────────
  const userData = await kv.get<string>(`github:user:${linkedByUid}`)
  if (!userData) {
    return NextResponse.json({ error: 'GitHub session expired for repo owner' }, { status: 401 })
  }

  const { accessToken } = typeof userData === 'string' ? JSON.parse(userData) : userData

  // ── Read current top funds from chain to compute next buy price ───────────
  let nextBuyPriceEth = '0.001'
  try {
    const [, topFunds] = await client.readContract({
      address: leaderboardAddress as `0x${string}`,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [1n],
    })
    const MIN_INCREMENT = BigInt('1000000000000000') // 0.001 ETH
    const topFund = topFunds[0] ?? 0n
    nextBuyPriceEth = parseFloat(formatEther(topFund + MIN_INCREMENT)).toFixed(4)
  } catch {
    // non-fatal — fall back to default
  }

  const leaderboardUrl = `https://markee.xyz/ecosystem/platforms/github/${leaderboardAddress}`

  // ── Fetch current file from GitHub ────────────────────────────────────────
  const fileRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    }
  )

  if (!fileRes.ok) {
    const err = await fileRes.text()
    return NextResponse.json({ error: `GitHub file fetch failed: ${err}` }, { status: 502 })
  }

  const fileData = await fileRes.json()
  const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')
  const sha = fileData.sha

  // ── Check delimiters exist ────────────────────────────────────────────────
  if (!currentContent.includes(START_DELIMITER) || !currentContent.includes(END_DELIMITER)) {
    return NextResponse.json(
      { error: `Delimiters not found in ${filePath}. Add <!-- MARKEE:START --> and <!-- MARKEE:END --> to your file.` },
      { status: 422 }
    )
  }

  // ── Replace content between delimiters ───────────────────────────────────
  const newBlock = buildMarkeeBlock(message, ownerName ?? null, nextBuyPriceEth, leaderboardUrl)
  const updatedContent = currentContent.replace(
    new RegExp(`${START_DELIMITER}[\\s\\S]*?${END_DELIMITER}`),
    newBlock
  )

  // ── Push commit ───────────────────────────────────────────────────────────
  const pushRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `chore: update Markee message in ${filePath}`,
        content: Buffer.from(updatedContent).toString('base64'),
        sha,
      }),
    }
  )

  if (!pushRes.ok) {
    const err = await pushRes.text()
    return NextResponse.json({ error: `GitHub push failed: ${err}` }, { status: 502 })
  }

  return NextResponse.json({ success: true, nextBuyPriceEth })
}
