// app/api/github/update-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { getLinkedFiles } from '@/lib/github/linkedFiles'

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

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name',    outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
] as const

const START_DELIMITER = '<!-- MARKEE:START -->'
const END_DELIMITER   = '<!-- MARKEE:END -->'

function buildMarkeeBlock(message: string, ownerName: string | null, nextBuyPriceEth: string, leaderboardUrl: string): string {
  const attribution = ownerName ? ` — ${ownerName}` : ''
  return `${START_DELIMITER}
> 🪧🪧🪧🪧🪧🪧🪧 MARKEE 🪧🪧🪧🪧🪧🪧🪧
>
> ${message}
> 
> ${attribution}
>
> 🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧🪧
>
> *Change this message for ${nextBuyPriceEth} ETH on the [Markee App](${leaderboardUrl}).*
${END_DELIMITER}`
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { leaderboardAddress } = (body ?? {}) as { leaderboardAddress?: string }
  if (!leaderboardAddress) return NextResponse.json({ error: 'Missing leaderboardAddress' }, { status: 400 })

  const normalizedAddress = leaderboardAddress.toLowerCase()

  const linkedFiles = await getLinkedFiles(normalizedAddress)
  const verifiedFiles = linkedFiles.filter(f => f.verified)
  if (verifiedFiles.length === 0)
    return NextResponse.json({ error: 'No verified files linked to this leaderboard' }, { status: 404 })

  // Read top message from chain
  let topMessage = ''
  let topOwnerName: string | null = null
  let nextBuyPriceEth = '0.001'
  try {
    const [topAddresses, topFunds] = await client.readContract({
      address: leaderboardAddress as `0x${string}`,
      abi: LEADERBOARD_ABI,
      functionName: 'getTopMarkees',
      args: [1n],
    })
    const topAddr = topAddresses[0]
    const topFund = topFunds[0] ?? 0n
    if (topAddr) {
      const [msg, name] = await Promise.all([
        client.readContract({ address: topAddr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' }),
        client.readContract({ address: topAddr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' }),
      ])
      topMessage   = msg  ?? ''
      topOwnerName = name || null
      nextBuyPriceEth = formatEther(topFund + BigInt('1000000000000000'))
    }
  } catch (err) {
    console.error('[update-markee-file] chain read error:', err)
  }

  if (!topMessage) return NextResponse.json({ error: 'No top message to write' }, { status: 400 })

  const leaderboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github/${leaderboardAddress}`
  const markeeBlock = buildMarkeeBlock(topMessage, topOwnerName, nextBuyPriceEth, leaderboardUrl)

  const results: Array<{ filePath: string; repoFullName: string; success: boolean; error?: string }> = []

  for (const file of verifiedFiles) {
    // Resolve access token from the user who linked this file
    let accessToken: string | null = null
    if (file.linkedByUid) {
      const raw = await kv.get(`github:user:${file.linkedByUid}`)
      if (raw) {
        const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
        accessToken = data?.accessToken ?? null
      }
    }

    if (!accessToken) {
      results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: 'GitHub token not found' })
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
      const startIdx = currentContent.indexOf(START_DELIMITER)
      const endIdx   = currentContent.indexOf(END_DELIMITER)

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: false, error: 'Delimiters not found in file' })
        continue
      }

      const updated = currentContent.slice(0, startIdx) + markeeBlock + currentContent.slice(endIdx + END_DELIMITER.length)

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
