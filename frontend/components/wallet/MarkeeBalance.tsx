'use client'

import { useAccount, useReadContract } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { formatUnits } from 'viem'
import { CANONICAL_CHAIN, MARKEE_TOKEN } from '@/lib/contracts/addresses'
import { useState, useEffect } from 'react'

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function MarkeeBalance() {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CANONICAL_CHAIN.id,
    query: {
      enabled: !!address && isConnected && authenticated,
    },
  })

  if (!mounted || !authenticated || !isConnected || !address || chain?.id !== CANONICAL_CHAIN.id) {
    return null
  }

  const markeeAmount = balance !== undefined ? parseFloat(formatUnits(balance, 18)) : null

  return (
    <div className="bg-[#060A2A] border border-[#8A8FBF]/30 rounded-lg px-4 py-2 flex items-center gap-2">
      <span className="text-[#F897FE] font-medium text-sm">
        {markeeAmount !== null ? `${markeeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} MARKEE` : '…'}
      </span>
    </div>
  )
}
