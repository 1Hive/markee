import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { optimism, base, arbitrum, mainnet } from 'viem/chains'
import { MARKEE_TOKEN } from '@/lib/contracts/addresses'
import { kv } from '@vercel/kv'

const MARKEE_THRESHOLD = 100n * 10n**18n // 100 MARKEE tokens

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// Create viem clients for each chain
const clients = {
  10: createPublicClient({ chain: optimism, transport: http() }),
  8453: createPublicClient({ chain: base, transport: http() }),
  42161: createPublicClient({ chain: arbitrum, transport: http() }),
  1: createPublicClient({ chain: mainnet, transport: http() }),
}

// Type definitions - using NUMBER for timestamp instead of bigint
interface Reaction {
  id: string
  markeeAddress: string
  userAddress: string
  emoji: string
  timestamp: number
  chainId: number
}

// Vercel KV storage (persistent)
async function getReactions(): Promise<Reaction[]> {
  const reactions = await kv.get<Reaction[]>('markee_reactions')
  return reactions || []
}

async function saveReactions(reactions: Reaction[]): Promise<void> {
  await kv.set('markee_reactions', reactions)
}

// Verify MARKEE balance
async function verifyBalance(address: string, chainId: number): Promise<boolean> {
  try {
    const client = clients[chainId as keyof typeof clients]
    if (!client) {
      console.error(`[Reactions] Unsupported chain ID: ${chainId}`)
      return false
    }

    const balance = await client.readContract({
      address: MARKEE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`]
    })

    const hasBalance = balance >= MARKEE_THRESHOLD
    console.log(`[Reactions] Balance check for ${address} on chain ${chainId}: ${hasBalance ? 'PASS' : 'FAIL'} (${balance.toString()})`)
    
    return hasBalance
  } catch (error) {
    console.error('[Reactions] Error verifying balance:', error)
    return false
  }
}

// GET: Fetch reactions for a specific Markee or all
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const markeeAddress = searchParams.get('markeeAddress')
    
    const reactions = await getReactions()
    
    if (markeeAddress) {
      const filtered = reactions.filter(
        r => r.markeeAddress.toLowerCase() === markeeAddress.toLowerCase()
      )
      return NextResponse.json({ reactions: filtered })
    }
    
    return NextResponse.json({ reactions })
  } catch (error) {
    console.error('[Reactions] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reactions' },
      { status: 500 }
    )
  }
}

// POST: Add or update a reaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { markeeAddress, userAddress, emoji, chainId } = body

    // Validation
    if (!markeeAddress || !userAddress || !emoji || !chainId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log(`[Reactions] Checking balance for ${userAddress} on chain ${chainId}`)

    // Verify balance
    const hasBalance = await verifyBalance(userAddress, chainId)
    if (!hasBalance) {
      console.log(`[Reactions] Balance check FAILED for ${userAddress}`)
      return NextResponse.json(
        { error: 'Insufficient MARKEE balance. You need at least 100 MARKEE tokens to react.' },
        { status: 403 }
      )
    }

    console.log(`[Reactions] Balance check PASSED for ${userAddress}`)

    // Get existing reactions
    const reactions = await getReactions()
    
    // Check if user already reacted to this Markee
    const existingIndex = reactions.findIndex(
      r => r.markeeAddress.toLowerCase() === markeeAddress.toLowerCase() &&
           r.userAddress.toLowerCase() === userAddress.toLowerCase()
    )

    const reaction: Reaction = {
      id: `${markeeAddress}-${userAddress}`,
      markeeAddress,
      userAddress,
      emoji,
      timestamp: Date.now(),
      chainId
    }

    if (existingIndex >= 0) {
      // Update existing reaction
      reactions[existingIndex] = reaction
      console.log(`[Reactions] Updated reaction for ${userAddress} on ${markeeAddress}`)
    } else {
      // Add new reaction
      reactions.push(reaction)
      console.log(`[Reactions] Added new reaction for ${userAddress} on ${markeeAddress}`)
    }

    await saveReactions(reactions)

    return NextResponse.json({ 
      success: true, 
      reaction 
    })
  } catch (error) {
    console.error('[Reactions] POST error:', error)
    return NextResponse.json(
      { error: 'Failed to add reaction' },
      { status: 500 }
    )
  }
}

// DELETE: Remove a reaction
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const markeeAddress = searchParams.get('markeeAddress')
    const userAddress = searchParams.get('userAddress')

    if (!markeeAddress || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const reactions = await getReactions()
    const filtered = reactions.filter(
      r => !(r.markeeAddress.toLowerCase() === markeeAddress.toLowerCase() &&
             r.userAddress.toLowerCase() === userAddress.toLowerCase())
    )

    await saveReactions(filtered)
    console.log(`[Reactions] Removed reaction for ${userAddress} on ${markeeAddress}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Reactions] DELETE error:', error)
    return NextResponse.json(
      { error: 'Failed to delete reaction' },
      { status: 500 }
    )
  }
}
