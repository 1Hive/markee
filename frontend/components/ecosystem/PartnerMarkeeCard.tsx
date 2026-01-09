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
}

export function PartnerMarkeeCard({ 
  partner, 
  winningMarkee, 
  totalFunds,
  markeeCount 
}: PartnerMarkeeCardProps) {
  return (
    <div className="bg-[#0A0F3D] rounded-lg p-6 border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors">
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
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 flex items-center justify-center min-h-[120px]">
          <div className="text-center w-full">
            <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2">
              {winningMarkee.message}
            </p>
            {winningMarkee.name && (
              <p className="text-[#8A8FBF] text-xs text-right">— {winningMarkee.name}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center">
          <div className="text-4xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">Be the first to buy a message</p>
        </div>
      )}

      {/* ETH Amount */}
      <div className="text-[#7C9CFF] text-xs font-medium mb-4">
        {Number(formatEther(totalFunds)).toFixed(4)} ETH raised
      </div>

      {/* CTAs */}
      <div className="flex gap-2">
        <Link
          href={`/ecosystem/${partner.slug}`}
          className="flex-1 bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
        >
          Buy a Message
        </Link>
        <Link
          href={`/ecosystem/${partner.slug}`}
          className="flex-1 bg-[#1A1F4D] text-[#EDEEFF] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#2A2F5D] transition-colors border border-[#8A8FBF]/20 text-sm"
        >
          View All Messages
        </Link>
      </div>
    </div>
  )
}
