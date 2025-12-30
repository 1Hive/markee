'use client'

import Link from 'next/link'
import { formatEth, formatAddress } from '@/lib/utils'
import type { Markee } from '@/types'

interface PartnerMarkeeCardProps {
  partner: {
    slug: string
    name: string
    logo: string
    description: string
    strategyAddress: string
  }
  winningMarkee?: Markee
  totalFunds: bigint
  isCooperative?: boolean
}

export function PartnerMarkeeCard({ 
  partner, 
  winningMarkee, 
  totalFunds,
  isCooperative = false 
}: PartnerMarkeeCardProps) {
  const hasCustomName = winningMarkee?.name && winningMarkee.name.trim()

  return (
    <div className="bg-[#0A0F3D] rounded-lg shadow-md border border-[#8A8FBF]/30 hover:border-[#F897FE] transition-all overflow-hidden">
      {/* Partner Header */}
      <div className="p-6 border-b border-[#8A8FBF]/20">
        <div className="flex items-center gap-4 mb-2">
          <img src={partner.logo} alt={partner.name} className="h-12 w-12 object-contain" />
          <div>
            <h3 className="text-xl font-bold text-[#EDEEFF]">{partner.name}</h3>
          </div>
        </div>
      </div>

      {/* Message Display - Bordered Section (Prominent) */}
      <div className="p-6">
        {winningMarkee ? (
          <div className="border-2 border-[#F897FE]/30 rounded-lg p-4 mb-4 bg-[#060A2A]">
            {/* Message */}
            <div className="font-jetbrains text-lg font-bold text-[#EDEEFF] mb-3 message-text">
              {winningMarkee.message}
            </div>

            {/* Author */}
            <p className="text-sm text-[#8A8FBF] italic">
              — <span className={hasCustomName ? 'text-[#B8B6D9] font-medium' : 'text-[#8A8FBF]'}>
                {hasCustomName ? winningMarkee.name : formatAddress(winningMarkee.owner)}
              </span>
            </p>
          </div>
        ) : (
          <div className="border-2 border-[#8A8FBF]/30 rounded-lg p-6 mb-4 bg-[#060A2A] text-center">
            <div className="text-4xl mb-2">🪧</div>
            <p className="text-[#8A8FBF]">Be the first to buy a message</p>
          </div>
        )}

        {/* Funding Split */}
        <div className="mb-4 p-3 bg-[#060A2A] rounded border border-[#8A8FBF]/20">
          <div className="text-xs text-[#8A8FBF] mb-2 font-semibold">FUNDING SPLIT</div>
          <div className="space-y-2">
            {isCooperative ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#B8B6D9]">Markee Cooperative RevNet</span>
                <span className="font-bold text-[#F897FE]">100%</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#B8B6D9]">{partner.name}</span>
                  <span className="font-bold text-[#7C9CFF]">68%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#B8B6D9]">Markee Cooperative</span>
                  <span className="font-bold text-[#F897FE]">32%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-[#8A8FBF] mb-4 leading-relaxed">
          {partner.description}
        </p>

        {/* CTAs */}
        <div className="flex gap-3">
          <Link 
            href={`/ecosystem/${partner.slug}`}
            className="flex-1 text-center bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors"
          >
            View All Messages
          </Link>
          <Link 
            href={`/ecosystem/${partner.slug}?action=create`}
            className="flex-1 text-center bg-[#060A2A] text-[#F897FE] border-2 border-[#F897FE] px-4 py-2 rounded-lg font-semibold text-sm hover:bg-[#F897FE]/10 transition-colors"
          >
            Buy a Message
          </Link>
        </div>
      </div>
    </div>
  )
}
