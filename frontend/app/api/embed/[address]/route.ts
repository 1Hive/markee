import { NextRequest } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'

export const dynamic = 'force-dynamic'

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
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
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

function getClient() {
  return createPublicClient({
    chain: base,
    transport: http(
      process.env.ALCHEMY_BASE_URL ?? 'https://mainnet.base.org',
      { fetchOptions: { cache: 'no-store' } },
    ),
  })
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(_req: NextRequest, { params }: { params: { address: string } }) {
  const { address } = params
  const buyUrl = `https://markee.xyz/ecosystem/website/${address}`

  let topMessage = ''
  let topOwner = ''
  let leaderboardName = ''
  let priceEth = '0.001'

  try {
    const client = getClient()
    const addr = address as `0x${string}`

    const [nameRes, priceRes, topRes] = await client.multicall({
      contracts: [
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' },
        { address: addr, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees', args: [3n] },
      ],
    })

    leaderboardName = (nameRes.result as string) ?? ''
    const minimumPrice = (priceRes.result as bigint) ?? 0n
    const topResult = topRes.result as [readonly `0x${string}`[], readonly bigint[]] | undefined

    if (topResult) {
      const [topAddresses, topFunds] = topResult
      const topIdx = topFunds.findIndex(f => f > 0n)

      if (topIdx >= 0 && topAddresses[topIdx]) {
        const topMarkeeAddr = topAddresses[topIdx]
        const topFund = topFunds[topIdx]
        const minIncrement = BigInt('1000000000000000') // 0.001 ETH
        const buyPrice = topFund + minIncrement > minimumPrice ? topFund + minIncrement : minimumPrice
        priceEth = formatEther(buyPrice)

        const [msgRes, ownerRes] = await client.multicall({
          contracts: [
            { address: topMarkeeAddr, abi: MARKEE_ABI, functionName: 'message' },
            { address: topMarkeeAddr, abi: MARKEE_ABI, functionName: 'owner' },
          ],
        })
        topMessage = (msgRes.result as string) ?? ''
        topOwner = (ownerRes.result as string) ?? ''
      } else {
        priceEth = formatEther(minimumPrice)
      }
    }
  } catch (e) {
    console.error('[embed] RPC error:', e)
  }

  const priceDisplay = parseFloat(priceEth).toFixed(3)
  const ownerDisplay = topOwner ? shortAddr(topOwner) : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Markee${leaderboardName ? ` — ${escapeHtml(leaderboardName)}` : ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: #060A2A;
      color: #EDEEFF;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 12px;
    }
    .widget {
      width: 100%;
      background: #0A0F3D;
      border: 1px solid rgba(138,143,191,0.25);
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .icon {
      flex-shrink: 0;
      font-size: 20px;
      line-height: 1;
    }
    .content {
      flex: 1;
      min-width: 0;
    }
    .message {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: #EDEEFF;
      word-break: break-word;
      margin-bottom: 3px;
    }
    .empty {
      color: #8A8FBF;
    }
    .meta {
      font-size: 11px;
      color: #8A8FBF;
    }
    .cta {
      flex-shrink: 0;
      background: #F897FE;
      color: #060A2A;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 13px;
      border-radius: 8px;
      text-decoration: none;
      white-space: nowrap;
    }
    .cta:hover { background: #7C9CFF; }
  </style>
</head>
<body>
  <div class="widget">
    <div class="icon">🌐</div>
    <div class="content">
      ${topMessage
        ? `<div class="message">${escapeHtml(topMessage)}</div>
           <div class="meta">${ownerDisplay ? `— ${ownerDisplay} · ` : ''}${priceDisplay} ETH to change</div>`
        : `<div class="message empty">No message yet — be the first!</div>
           <div class="meta">${priceDisplay} ETH to set the first message</div>`}
    </div>
    <a class="cta" href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener">Change</a>
  </div>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
    },
  })
}
