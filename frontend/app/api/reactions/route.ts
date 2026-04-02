import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { optimism, base, arbitrum, mainnet } from 'viem/chains'
import { MARKEE_TOKEN } from '@/lib/contracts/addresses'
import { kv } from '@vercel/kv'

const MARKEE_THRESHOLD = 100n * 10n**18n

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const clients = {
  10: createPublicClient({ chain: optimism, transport: http() }),
  8453: createPublicClient({ chain: base, transport: http() }),
  42161: createPublicClient({ chain: arbitrum, transport: http() }),
  1: createPublicClient({ chain: mainnet, transport: http() }),
}

interface Reaction {
  id: string
  markeeAddress: string
  userAddress: string
  emoji: string
  timestamp: number
  chainId: number
}

// Per-markee hash keys eliminate the GET→modify→SET race condition.
// Each hset/hdel is a single atomic KV command.
function reactionsKey(markeeAddress: string) {
  return `reactions:v2:${markeeAddress.toLowerCase()}`
}

async function getReactionsForMarkee(markeeAddress: string): Promise<Reaction[]> {
  const hash = await kv.hgetall<Record<string, string>>(reactionsKey(markeeAddress))
  if (!hash) return []
  return Object.values(hash).map(v => JSON.parse(v) as Reaction)
}

// Balance check with 5-minute KV cache to avoid an RPC call on every request
async function verifyBalance(address: string, chainId: number): Promise<boolean> {
  const cacheKey = `balance:markee:${address.toLowerCase()}:${chainId}`
  const cached = await kv.get<boolean>(cacheKey)
  if (cached !== null) return cached

  try {
    const client = clients[chainId as keyof typeof clients]
    if (!client) return false

    const balance = await client.readContract({
      address: MARKEE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`]
    })

    const hasBalance = balance >= MARKEE_THRESHOLD
    await kv.set(cacheKey, hasBalance, { ex: 300 }) // 5 min
    return hasBalance
  } catch (error) {
    console.error('[Reactions] Balance check error:', error)
    return false
  }
}

// GET /api/reactions?markeeAddress=0x...
export async function GET(request: NextRequest) {
  try {
    const markeeAddress = request.nextUrl.searchParams.get('markeeAddress')
    if (!markeeAddress) {
      return NextResponse.json({ reactions: [] })
    }
    const reactions = await getReactionsForMarkee(markeeAddress)
    return NextResponse.json({ reactions })
  } catch (error) {
    console.error('[Reactions] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 })
  }
}

// POST /api/reactions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { markeeAddress, userAddress, emoji, chainId } = body

    if (!markeeAddress || !userAddress || !emoji || !chainId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Rate limit: 1 reaction change per user per 30 seconds
    const rateLimitKey = `ratelimit:reactions:${userAddress.toLowerCase()}`
    const acquired = await kv.set(rateLimitKey, 1, { ex: 30, nx: true })
    if (acquired === null) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before reacting again.' },
        { status: 429 }
      )
    }

    const hasBalance = await verifyBalance(userAddress, chainId)
    if (!hasBalance) {
      return NextResponse.json(
        { error: 'Insufficient MARKEE balance. You need at least 100 MARKEE tokens to react.' },
        { status: 403 }
      )
    }

    const reaction: Reaction = {
      id: `${markeeAddress}-${userAddress}`,
      markeeAddress,
      userAddress,
      emoji,
      timestamp: Date.now(),
      chainId,
    }

    // Atomic hset — one command, no race condition
    await kv.hset(reactionsKey(markeeAddress), {
      [userAddress.toLowerCase()]: JSON.stringify(reaction),
    })

    return NextResponse.json({ success: true, reaction })
  } catch (error) {
    console.error('[Reactions] POST error:', error)
    return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 })
  }
}

// DELETE /api/reactions?markeeAddress=0x...&userAddress=0x...
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const markeeAddress = searchParams.get('markeeAddress')
    const userAddress = searchParams.get('userAddress')

    if (!markeeAddress || !userAddress) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Atomic hdel — one command, no race condition
    await kv.hdel(reactionsKey(markeeAddress), userAddress.toLowerCase())

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Reactions] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete reaction' }, { status: 500 })
  }
}
