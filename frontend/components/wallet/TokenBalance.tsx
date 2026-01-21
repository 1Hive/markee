'use client'

import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { formatUnits } from 'viem'
import { MARKEE_TOKEN, CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { ArrowRightLeft } from 'lucide-react'

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function TokenBalance() {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()

  const { data: balance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CANONICAL_CHAIN.id,
    query: {
      enabled: !!address && isConnected && chain?.id === CANONICAL_CHAIN.id,
    },
  })

  // Don't show anything if wallet not connected
  if (!isConnected || !address) {
    return null
  }

  // Show switch network button if not on Base
  if (chain?.id !== CANONICAL_CHAIN.id) {
    return (
      <button
        onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
        className="bg-[#FFA94D] text-[#060A2A] px-4 py-2 rounded-lg font-medium hover:bg-[#FF8E3D] flex items-center gap-2 transition-colors"
      >
        <ArrowRightLeft size={16} />
        <span className="hidden sm:inline">Switch Network to Base</span>
        <span className="sm:hidden">Base</span>
      </button>
    )
  }

  // Format the balance (18 decimals for MARKEE token)
  const formattedBalance = balance 
    ? parseFloat(formatUnits(balance, 18)).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    : '0'

  return (
    <div className="bg-[#060A2A] border border-[#8A8FBF]/30 rounded-lg px-4 py-2 flex items-center gap-2">
      <span className="text-[#8A8FBF] font-medium">{formattedBalance}</span>
        <a 
        href="https://app.revnet.eth.sucks/v5:base:119/ops" 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-[#F897FE] text-sm hover:text-[#F897FE] transition-colors"
        >
        MARKEE
        </a>
    </div>
  )
}
