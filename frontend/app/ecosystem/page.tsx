'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronRight, Github } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { PartnerMarkeeCard } from '@/components/ecosystem/PartnerMarkeeCard'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { PartnerReserveDistributor } from '@/components/ecosystem/PartnerReserveDistributor'
import { usePartnerMarkees } from '@/lib/contracts/usePartnerMarkees'
import { useViews } from '@/hooks/useViews'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { ModerationProvider } from '@/components/moderation'
import { ExternalLink } from 'lucide-react'
import type { Markee } from '@/types'

// ─── Platform cards ───────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    slug: 'github',
    name: 'Github Repo',
    description: 'Add a Markee message to your README, agent SKILL file, or any markdown file in your project.',
    logoType: 'icon' as const,
    cta: 'See Markees on Github',
  },
  {
    slug: 'superfluid',
    name: 'Superfluid Project',
    description: 'For builders in the Superfluid ecosystem — create a Markee message and earn SUP rewards.',
    logoType: 'image' as const,
    logoSrc: '/partners/superfluid.png',
    cta: 'See Markees on Superfluid',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EcosystemPage() {
  const { partnerData, isLoading, error } = usePartnerMarkees()
  const [selectedPartnerSlug, setSelectedPartnerSlug] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const selectedPartner = partnerData.find(p => p.partner.slug === selectedPartnerSlug)

  // ── View tracking ──────────────────────────────────────────────────
  const winningMarkees: Markee[] = partnerData
    .filter(({ winningMarkee }) => !!winningMarkee)
    .map(({ winningMarkee }) => winningMarkee as Markee)

  const { views, trackView } = useViews(winningMarkees)

  useEffect(() => {
    if (winningMarkees.length === 0) return
    winningMarkees.forEach(trackView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningMarkees.map(m => m.address).join(',')])

  const getWinnerViews = (markee?: Markee) => {
    if (!markee) return undefined
    return views.get(markee.address.toLowerCase())?.totalViews
  }
  // ──────────────────────────────────────────────────────────────────

  const handleBuyMessage = (partnerSlug: string) => {
    setSelectedPartnerSlug(partnerSlug)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedPartnerSlug(null)
  }

  const handleModalSuccess = () => {
    // Data will refresh on page navigation/reload
  }

  const livePartners = partnerData
    .filter(({ partner }) => !!partner.liveUrl)
    .sort((a, b) => (b.totalFunds > a.totalFunds ? 1 : -1))

  const waitlistPartners = partnerData
    .filter(({ partner }) => !partner.liveUrl)
    .sort((a, b) => (b.totalFunds > a.totalFunds ? 1 : -1))

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-6">Raise funds with Markee</h1>
          <p className="text-xl md:text-2xl text-[#8A8FBF] mb-8 max-w-3xl mx-auto">
            Explore the Universe of Markee messages expanding across the internet.
          </p>
        </div>
      </section>

      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Platform cards */}
          <div className="mb-16">
            <h2 className="text-lg font-semibold text-[#8A8FBF] mb-5">Raise Funding for Your:</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLATFORMS.map(platform => (
                <Link
                  key={platform.slug}
                  href={`/ecosystem/platforms/${platform.slug}`}
                  className="group flex items-start gap-4 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/50 transition-all p-5"
                >
                  <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 overflow-hidden">
                    {platform.logoType === 'image' ? (
                      <img
                        src={(platform as { logoSrc: string }).logoSrc}
                        alt={platform.name}
                        className="w-6 h-6 object-contain"
                      />
                    ) : (
                      <Github size={20} className="text-[#EDEEFF]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[#EDEEFF] font-semibold text-sm mb-1 group-hover:text-[#F897FE] transition-colors">
                      {platform.name}
                    </h3>
                    <p className="text-[#8A8FBF] text-xs mb-3 leading-relaxed">{platform.description}</p>
                    <div className="flex items-center gap-1 text-[#7C9CFF] text-xs group-hover:text-[#F897FE] transition-colors">
                      {platform.cta}
                      <ChevronRight size={13} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Partner markees */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse">
                  <div className="h-48 bg-[#1A1F4D] rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 text-center">
              <p className="text-[#FF8E8E]">Error loading partners: {error.message}</p>
            </div>
          ) : (
            <ModerationProvider>

              {/* Live Integrations */}
              {livePartners.length > 0 && (
                <div className="mb-16">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-2xl font-bold text-[#EDEEFF]">Live Integrations</h2>
                    <span className="flex items-center gap-1.5 bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE] text-xs font-semibold px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F897FE] animate-pulse" />
                      Live
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {livePartners.map(({ partner, winningMarkee, totalFunds, markeeCount }) => (
                      <div key={partner.slug} className="relative">
                        <a
                          href={partner.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 hover:bg-[#F897FE]/5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-medium px-4 py-2 rounded-t-lg transition-all"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={12} />
                          {partner.liveUrl?.replace(/^https?:\/\//, '')}
                        </a>
                        <div className="rounded-t-none rounded-b-lg overflow-hidden border border-t-0 border-[#F897FE]/20">
                          <PartnerMarkeeCard
                            partner={partner}
                            winningMarkee={winningMarkee ?? undefined}
                            totalFunds={totalFunds}
                            markeeCount={markeeCount}
                            chainId={CANONICAL_CHAIN_ID}
                            onBuyMessage={() => handleBuyMessage(partner.slug)}
                            totalViews={getWinnerViews(winningMarkee ?? undefined)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waitlist */}
              {waitlistPartners.length > 0 && (
                <div className="mb-12">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-2xl font-bold text-[#EDEEFF]">Coming Soon</h2>
                    <span className="bg-[#8A8FBF]/15 border border-[#8A8FBF]/30 text-[#8A8FBF] text-xs font-semibold px-3 py-1 rounded-full">
                      Waitlist
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {waitlistPartners.map(({ partner, winningMarkee, totalFunds, markeeCount }) => (
                      <div key={partner.slug} className="opacity-80">
                        <PartnerMarkeeCard
                          partner={partner}
                          winningMarkee={winningMarkee ?? undefined}
                          totalFunds={totalFunds}
                          markeeCount={markeeCount}
                          chainId={CANONICAL_CHAIN_ID}
                          onBuyMessage={() => handleBuyMessage(partner.slug)}
                          totalViews={getWinnerViews(winningMarkee ?? undefined)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </ModerationProvider>
          )}

          {/* Partner Reserve Distributor */}
          <PartnerReserveDistributor
            partners={partnerData.map(({ partner }) => ({
              name: partner.name,
              strategyAddress: partner.strategyAddress,
            }))}
          />
        </div>
      </section>

      <section className="py-24 bg-gradient-to-b from-[#060A2A] to-[#0A0F3D]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-[#EDEEFF] mb-6">
            Want to add a Markee to your site?
          </h2>
          <p className="text-xl text-[#8A8FBF] mb-8">
            We'll work with you to make it right for your site. Current lead time: 1-2 months
          </p>
          <div className="flex justify-center">
            <a
              href="https://form.typeform.com/to/GsKEKbQj"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#7C9CFF] text-[#060A2A] px-8 py-4 rounded-lg font-semibold hover:bg-[#F897FE] transition-colors"
            >
              Join the Waitlist
            </a>
          </div>
        </div>
      </section>

      <Footer />

      {selectedPartner && (
        <TopDawgModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          strategyAddress={selectedPartner.partner.strategyAddress as `0x${string}`}
          partnerName={selectedPartner.partner.isCooperative ? undefined : selectedPartner.partner.name}
          partnerSplitPercentage={selectedPartner.partner.isCooperative ? undefined : selectedPartner.partner.percentToBeneficiary / 100}
          topFundsAdded={selectedPartner.winningMarkee?.totalFundsAdded}
        />
      )}
    </div>
  )
}
