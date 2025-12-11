import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { optimism, base, arbitrum, mainnet } from 'viem/chains'
import { MARKEE_TOKEN } from '@/lib/contracts/addresses'

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

// Storage keys
const REACTIONS_KEY = 'markee_reactions'

// Type definitions
interface Reaction {
  id: string
  markeeAddress: string
  userAddress: string
  emoji: string
  timestamp: number
  chainId: number
}

// Get reactions from localStorage (browser) or in-memory store (server)
let serverReactions: Reaction[] = []

function getReactions(): Reaction[] {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(REACTIONS_KEY)
    return stored ? JSON.parse(stored) : []
  }
  return serverReactions
}

function saveReactions(reactions: Reaction[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(REACTIONS_KEY, JSON.stringify(reactions))
  } else {
    serverReactions = reactions
  }
}

// Verify MARKEE balance
async function verifyBalance(address: string, chainId: number): Promise<boolean> {
  try {
    // Skip verification if using placeholder address
    if (MARKEE_TOKEN === '0xf2A27822c8b7404c6aA7C3d7e2876DF597f02807') {
      console.warn('Using placeholder MARKEE token address - skipping balance verification')
      return true
    }

    const client = clients[chainId as keyof typeof clients]
    if (!client) {
      throw new Error(`Unsupported chain ID: ${chainId}`)
    }

    const balance = await client.readContract({
      address: MARKEE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`]
    })

    return balance >= MARKEE_THRESHOLD
  } catch (error) {
    console.error('Error verifying balance:', error)
    return false
  }
}

// GET: Fetch reactions for a specific Markee or all
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const markeeAddress = searchParams.get('markeeAddress')
    
    const reactions = getReactions()
    
    if (markeeAddress) {
      const filtered = reactions.filter(
        r => r.markeeAddress.toLowerCase() === markeeAddress.toLowerCase()
      )
      return NextResponse.json({ reactions: filtered })
    }
    
    return NextResponse.json({ reactions })
  } catch (error) {
    console.error('GET reactions error:', error)
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

    // Verify balance
    const hasBalance = await verifyBalance(userAddress, chainId)
    if (!hasBalance) {
      return NextResponse.json(
        { error: 'Insufficient MARKEE balance. You need at least 100 MARKEE tokens to react.' },
        { status: 403 }
      )
    }

    // Get existing reactions
    const reactions = getReactions()
    
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
    } else {
      // Add new reaction
      reactions.push(reaction)
    }

    saveReactions(reactions)

    return NextResponse.json({ 
      success: true, 
      reaction 
    })
  } catch (error) {
    console.error('POST reaction error:', error)
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

    const reactions = getReactions()
    const filtered = reactions.filter(
      r => !(r.markeeAddress.toLowerCase() === markeeAddress.toLowerCase() &&
             r.userAddress.toLowerCase() === userAddress.toLowerCase())
    )

    saveReactions(filtered)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE reaction error:', error)
    return NextResponse.json(
      { error: 'Failed to delete reaction' },
      { status: 500 }
    )
  }
}
