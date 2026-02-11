'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatEther } from 'viem'
import type { Markee } from '@/types'

interface Partner {
  slug: string
  name: string
  description: string
  logo: string
  fundingSplit: string
  strategyAddress: string
  percentToBeneficiary: number
  isCooperative?: boolean
}

interface PartnerMarkeeCardProps {
  partner: Partner
  winningMarkee?: Markee
  totalFunds: bigint
  markeeCount?: bigint
  onBuyMessage?: () => void
}

export function PartnerMarkeeCard({ 
  partner, 
  winningMarkee, 
  totalFunds,
  markeeCount,
  onBuyMessage
}: PartnerMarkeeCardProps) {
  const router = useRouter()

  const handleCardClick = () => {
    router.push(`/ecosystem/${partner.slug}`)
  }

  const handleBuyClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onBuyMessage?.()
  }

  return (
    <div
      onClick={handleCardClick}
      className="bg-[#0A0F3D] rounded-lg p-6 border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors cursor-pointer"
    >
      {/* Partner Header */}
      <div className="flex items-center gap-3 mb-3">
        <img src={partner.logo} alt={partner.name} className="h-12 w-12 object-contain" />
        <div className="flex-1">
          <h3 className="font-bold text-[#EDEEFF] text-lg">{partner.name}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-[#8A8FBF] text-sm mb-4">{partner.description}</p>

      {/* Winning Message Section */}
      {winningMarkee ? (
        <Link 
          href={`/markee/${winningMarkee.address}`} 
          onClick={(e) => e.stopPropagation()}
          className="block"
        >
          <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 hover:border-[#7C9CFF]/50 transition-colors flex items-center justify-center min-h-[120px]">
            <div className="text-center w-full">
              <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2">
                {winningMarkee.message}
              </p>
              {winningMarkee.name && (
                <p className="text-[#8A8FBF] text-xs text-right">— {winningMarkee.name}</p>
              )}
            </div>
          </div>
        </Link>
      ) : (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center">
          <div className="text-4xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">Be the first to buy a message</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-[#7C9CFF] font-medium">
          {Number(formatEther(totalFunds)).toFixed(4)} ETH raised
        </span>
        {markeeCount !== undefined && (
          <span className="text-[#8A8FBF]">
            {markeeCount.toString()} {Number(markeeCount) === 1 ? 'message' : 'messages'}
          </span>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={handleBuyClick}
        className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
      >
        Buy a Message
      </button>
    </div>
  )
}
