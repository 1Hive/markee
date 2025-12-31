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
          <p className="text-[#8A8FBF] text-sm">{partner.fundingSplit}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-[#8A8FBF] text-sm mb-4">{partner.description}</p>

      {/* Winning Message Section */}
      {winningMarkee ? (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-2xl">🏆</span>
            <div className="flex-1">
              <p className="text-[#EDEEFF] font-mono text-sm break-words">
                {winningMarkee.message}
              </p>
              {winningMarkee.name && (
                <p className="text-[#8A8FBF] text-xs mt-1">— {winningMarkee.name}</p>
              )}
            </div>
          </div>
          <div className="text-[#7C9CFF] text-xs font-medium">
            {formatEther(winningMarkee.totalFundsAdded)} ETH
          </div>
        </div>
      ) : (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center">
          <div className="text-4xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">Be the first to buy a message</p>
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-2">
        <Link
          href={`/ecosystem/${partner.slug}`}
          className="flex-1 bg-[#7C9CFF] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#F897FE] transition-colors text-sm"
        >
          View All Messages
        </Link>
        <Link
          href={`/ecosystem/${partner.slug}`}
          className="flex-1 bg-[#1A1F4D] text-[#EDEEFF] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#2A2F5D] transition-colors border border-[#8A8FBF]/20 text-sm"
        >
          Buy a Message
        </Link>
      </div>
    </div>
  )
}
