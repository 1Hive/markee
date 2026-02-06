
'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits } from 'viem'
import { base } from 'wagmi/chains'
import { MARKEE_TOKEN, PARTNER_RESERVE_DISTRIBUTOR } from '@/lib/addresses'

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

export function PartnerReserveDistributor() {
  const { isConnected } = useAccount()
  const [showPreview, setShowPreview] = useState(false)

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
    <div className="bg-gradient-to-r from-[#7C9CFF]/10 to-[#F897FE]/10 border border-[#7C9CFF]/30 rounded-lg p-6 mb-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-[#EDEEFF] mb-2">Partner Reserve Pool</h3>
          <p className="text-[#8A8FBF]">
            {hasBalance ? (
              <>
                <span className="text-2xl font-bold text-[#7C9CFF]">{parseFloat(balanceFormatted).toFixed(4)} MARKEE</span>
                {' '}ready to distribute to partners
              </>
            ) : (
              'No MARKEE available for distribution'
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {hasBalance && (
            <>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 bg-[#0A0F3D] border border-[#7C9CFF]/50 text-[#7C9CFF] rounded-lg hover:bg-[#7C9CFF]/10 transition-colors text-sm"
              >
                {showPreview ? 'Hide Preview' : 'Preview Distribution'}
              </button>
              
              <button
                onClick={handleDistribute}
                disabled={!isConnected || isPending || isConfirming}
                className="px-6 py-3 bg-[#7C9CFF] text-[#060A2A] rounded-lg font-semibold hover:bg-[#F897FE] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending || isConfirming ? 'Distributing...' : 'Distribute to Partners'}
              </button>
            </>
          )}

          {!isConnected && hasBalance && (
            <p className="text-sm text-[#8A8FBF] text-center">Connect wallet to distribute</p>
          )}
        </div>
      </div>

      {/* Preview Section */}
      {showPreview && preview && preview[0].length > 0 && (
        <div className="mt-6 pt-6 border-t border-[#7C9CFF]/30">
          <h4 className="text-sm font-semibold text-[#EDEEFF] mb-3">Distribution Preview</h4>
          <div className="space-y-2">
            {preview[0].map((strategy, index) => {
              const amount = preview[2][index]
              if (amount === 0n) return null
              
              return (
                <div key={strategy} className="flex justify-between items-center text-sm">
                  <span className="text-[#8A8FBF] font-mono">
                    {strategy.slice(0, 6)}...{strategy.slice(-4)}
                  </span>
                  <span className="text-[#7C9CFF] font-semibold">
                    {parseFloat(formatUnits(amount, 18)).toFixed(4)} MARKEE
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Success Message */}
      {isSuccess && (
        <div className="mt-4 p-4 bg-[#7C9CFF]/20 border border-[#7C9CFF] rounded-lg">
          <p className="text-[#7C9CFF] font-semibold">✓ Distribution successful!</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg">
          <p className="text-[#FF8E8E] text-sm">{error.message}</p>
        </div>
      )}
    </div>
  )
}
