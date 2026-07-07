'use client'

import { useAccount, useBalance } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { formatEther } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'

export function EthBalance() {
  const { authenticated } = usePrivy()
  const { address, isConnected, chain } = useAccount()
  const ethPrice = useEthPrice()

  const { data: balanceData } = useBalance({
    address,
    chainId: CANONICAL_CHAIN.id,
    query: {
      enabled: !!address && isConnected && authenticated,
    },
  })

  if (!authenticated || !isConnected || !address || chain?.id !== CANONICAL_CHAIN.id) {
    return null
  }

  const ethAmount = balanceData ? parseFloat(formatEther(balanceData.value)) : null
  const usdAmount = ethAmount !== null && ethPrice ? ethAmount * ethPrice : null

  return (
    <div className="bg-[#060A2A] border border-[#8A8FBF]/30 rounded-lg px-4 py-2 flex items-center gap-2">
      <span className="text-[#8A8FBF] font-medium text-sm">
        {ethAmount !== null ? `${ethAmount.toFixed(3)} ETH` : '…'}
      </span>
      {usdAmount !== null && (
        <span className="text-[#7C9CFF] font-medium text-sm">{formatUsd(usdAmount)}</span>
      )}
    </div>
  )
}
