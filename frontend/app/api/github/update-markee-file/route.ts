// app/api/github/update-markee-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { getLinkedFiles } from '../register-markee/route'

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

function buildMarkeeBlock(
  message: string,
  ownerName: string | null,
  nextBuyPriceEth: string,
  leaderboardUrl: string,
): string {
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

// ── POST /api/github/update-markee-file ──────────────────────────────────────
//
// Called by a webhook or cron whenever the top message on a leaderboard changes.
// Writes the current top message between the MARKEE delimiters in every verified
// linked file for this leaderboard.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { leaderboardAddress } = (body ?? {}) as { leaderboardAddress?: string }

  if (!leaderboardAddress) {
    return NextResponse.json({ error: 'Missing leaderboardAddress' }, { status: 400 })
  }

  const normalizedAddress = (leaderboardAddress as string).toLowerCase()

  // ── Load linked files ───────────────────────────────────────────────────────
  //
  // getLinkedFiles handles both the legacy single-object KV format and the new
  // LinkedFile[] array format, so this works regardless of when the leaderboard
  // was registered.
  const linkedFiles = await getLinkedFiles(normalizedAddress)
  const verifiedFiles = linkedFiles.filter(f => f.verified)

  if (verifiedFiles.length === 0) {
    return NextResponse.json(
      { error: 'No verified files linked to this leaderboard' },
      { status: 404 }
    )
  }

  // ── Read top message + price from chain ─────────────────────────────────────
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

      const minIncrement = BigInt('1000000000000000') // 0.001 ETH
      nextBuyPriceEth = formatEther(topFund + minIncrement)
    }
  } catch (err) {
    console.error('[update-markee-file] chain read error:', err)
  }

  if (!topMessage) {
    return NextResponse.json({ error: 'No top message to write' }, { status: 400 })
  }

  const leaderboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github/${leaderboardAddress}`
  const markeeBlock = buildMarkeeBlock(topMessage, topOwnerName, nextBuyPriceEth, leaderboardUrl)

  // ── Write to each verified file ─────────────────────────────────────────────
  const results: Array<{ filePath: string; repoFullName: string; success: boolean; error?: string }> = []

  for (const file of verifiedFiles) {
    // Resolve the GitHub token: prefer the token of whoever linked this specific
    // file (linkedByUid). Fall back to any available token if uid is blank
    // (legacy entries from before multi-file support).
    const uid = file.linkedByUid
    let accessToken: string | null = null

    if (uid) {
      const raw = await kv.get(`github:user:${uid}`)
      if (raw) {
        const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, string>)
        accessToken = data?.accessToken ?? null
      }
    }

    if (!accessToken) {
      results.push({
        repoFullName: file.repoFullName,
        filePath: file.filePath,
        success: false,
        error: 'GitHub token not found for this file',
      })
      continue
    }

    try {
      // Get the file's current content + SHA (needed for the PUT)
      const fileRes = await fetch(
        `https://api.github.com/repos/${file.repoFullName}/contents/${encodeURIComponent(file.filePath)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
          },
        }
      )

      if (!fileRes.ok) {
        results.push({
          repoFullName: file.repoFullName,
          filePath: file.filePath,
          success: false,
          error: `Could not fetch file (${fileRes.status})`,
        })
        continue
      }

      const fileData = await fileRes.json()
      const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8')
      const fileSha = fileData.sha

      // Replace content between delimiters
      const startIdx = currentContent.indexOf(START_DELIMITER)
      const endIdx   = currentContent.indexOf(END_DELIMITER)

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        results.push({
          repoFullName: file.repoFullName,
          filePath: file.filePath,
          success: false,
          error: 'Delimiters not found in file',
        })
        continue
      }

      const before  = currentContent.slice(0, startIdx)
      const after   = currentContent.slice(endIdx + END_DELIMITER.length)
      const updated = before + markeeBlock + after

      // Write the updated file back
      const putRes = await fetch(
        `https://api.github.com/repos/${file.repoFullName}/contents/${encodeURIComponent(file.filePath)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `markee: update sponsored message`,
            content: Buffer.from(updated).toString('base64'),
            sha:     fileSha,
          }),
        }
      )

      if (!putRes.ok) {
        const errBody = await putRes.text()
        results.push({
          repoFullName: file.repoFullName,
          filePath: file.filePath,
          success: false,
          error: `GitHub write failed (${putRes.status}): ${errBody.slice(0, 200)}`,
        })
      } else {
        results.push({ repoFullName: file.repoFullName, filePath: file.filePath, success: true })
      }
    } catch (err) {
      results.push({
        repoFullName: file.repoFullName,
        filePath: file.filePath,
        success: false,
        error: String(err),
      })
    }
  }

  const anySuccess = results.some(r => r.success)
  return NextResponse.json({ success: anySuccess, results })
}
