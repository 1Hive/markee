'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits } from 'viem'
import { base } from 'wagmi/chains'
import { MARKEE_TOKEN, PARTNER_RESERVE_DISTRIBUTOR } from '@/lib/contracts/addresses'

const DISTRIBUTOR_ABI = [
  {
    inputs: [],
    name: 'distribute',
    outputs: [{ internalType: 'uint256', name: 'totalDistributed', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'previewDistribution',
    outputs: [
      { internalType: 'address[]', name: 'strategies', type: 'address[]' },
      { internalType: 'address[]', name: 'beneficiaries', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      { internalType: 'uint256', name: 'totalFunds', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

interface Partner {
  name: string
  strategyAddress: string
}

interface PartnerReserveDistributorProps {
  partners?: Partner[]
}

export function PartnerReserveDistributor({ partners = [] }: PartnerReserveDistributorProps) {
  const { isConnected } = useAccount()
  const [showPreview, setShowPreview] = useState(false)

  // Create a map of strategy addresses to partner names
  const strategyToName = partners.reduce((acc, partner) => {
    acc[partner.strategyAddress.toLowerCase()] = partner.name
    return acc
  }, {} as Record<string, string>)

  // Read distributor balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: MARKEE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [PARTNER_RESERVE_DISTRIBUTOR],
    chainId: base.id,
  })

  // Read distribution preview
  const { data: preview } = useReadContract({
    address: PARTNER_RESERVE_DISTRIBUTOR,
    abi: DISTRIBUTOR_ABI,
    functionName: 'previewDistribution',
    chainId: base.id,
    query: {
      enabled: showPreview && balance !== undefined && balance > 0n,
    },
  })

  // Write contract
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  // Wait for transaction
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  // Refetch balance after successful distribution
  if (isSuccess) {
    refetchBalance()
  }

  const handleDistribute = () => {
    writeContract({
      address: PARTNER_RESERVE_DISTRIBUTOR,
      abi: DISTRIBUTOR_ABI,
      functionName: 'distribute',
      chainId: base.id,
    })
  }

  const balanceFormatted = balance ? formatUnits(balance, 18) : '0'
  const hasBalance = balance !== undefined && balance > 0n

  return (
    <div className="bg-gradient-to-r from-[#7C9CFF]/10 to-[#F897FE]/10 border border-[#7C9CFF]/30 rounded-lg p-8 max-w-xl mx-auto">
      <div className="text-center">
        <h3 className="text-xl font-bold text-[#EDEEFF] mb-3">Partner Reserve Pool</h3>
        
        <p className="text-[#8A8FBF] mb-6">
          {hasBalance ? (
            <span className="text-3xl font-bold text-[#7C9CFF] block">
              {parseFloat(balanceFormatted).toFixed(2)} MARKEE
            </span>
          ) : (
            'No MARKEE available for distribution'
          )}
        </p>

        {hasBalance && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
            <button
              onClick={handleDistribute}
              disabled={!isConnected || isPending || isConfirming}
              className="px-6 py-3 bg-[#7C9CFF] text-[#060A2A] rounded-lg font-semibold hover:bg-[#F897FE] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
            >
              {isPending || isConfirming ? 'Distributing...' : 'Distribute'}
            </button>

            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-6 py-3 bg-[#0A0F3D] border border-[#7C9CFF]/50 text-[#7C9CFF] rounded-lg hover:bg-[#7C9CFF]/10 transition-colors font-semibold min-w-[160px]"
            >
              {showPreview ? 'Hide Preview' : 'Preview Distribution'}
            </button>
          </div>
        )}

        {!isConnected && hasBalance && (
          <p className="text-sm text-[#8A8FBF] mb-4">Connect wallet to distribute</p>
        )}

        <p className="text-sm text-[#8A8FBF]">
          Learn how the community reserve is distributed on the{' '}
          <a 
            href="https://www.markee.xyz/owners" 
            className="text-[#7C9CFF] hover:text-[#F897FE] transition-colors underline"
          >
            Owners
          </a>
          {' '}page
        </p>
      </div>

      {/* Preview Section */}
      {showPreview && preview && preview[0].length > 0 && (
        <div className="mt-8 pt-6 border-t border-[#7C9CFF]/30">
          <h4 className="text-sm font-semibold text-[#EDEEFF] mb-4 text-center">Distribution Preview</h4>
          <div className="space-y-2">
            {preview[0]
              .map((strategy, index) => ({
                strategy,
                beneficiary: preview[1][index],
                amount: preview[2][index],
                index,
              }))
              .filter(item => item.amount > 0n)
              .sort((a, b) => {
                // Sort by amount, highest first
                if (a.amount > b.amount) return -1
                if (a.amount < b.amount) return 1
                return 0
              })
              .map(({ strategy, beneficiary, amount }) => {
                const partnerName = strategyToName[strategy.toLowerCase()]
                const beneficiaryShort = beneficiary.slice(-4)
                
                return (
                  <div key={strategy} className="flex justify-between items-center text-sm gap-4">
                    <span className="text-[#8A8FBF]">
                      {partnerName || (
                        <span className="font-mono">
                          {strategy.slice(0, 6)}...{strategy.slice(-4)}
                        </span>
                      )}
                      {' '}
                      <a
                        href={`https://basescan.org/address/${beneficiary}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#7C9CFF] hover:text-[#F897FE] transition-colors font-mono"
                      >
                        ...{beneficiaryShort}
                      </a>
                    </span>
                    <span className="text-[#7C9CFF] font-semibold whitespace-nowrap">
                      {parseFloat(formatUnits(amount, 18)).toFixed(2)} MARKEE
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Success Message */}
      {isSuccess && (
        <div className="mt-6 p-4 bg-[#7C9CFF]/20 border border-[#7C9CFF] rounded-lg">
          <p className="text-[#7C9CFF] font-semibold text-center">✓ Distribution successful!</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-6 p-4 bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg">
          <p className="text-[#FF8E8E] text-sm text-center">{error.message}</p>
        </div>
      )}
    </div>
  )
}
