'use client'

import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { PartnerMarkeeCard } from '@/components/ecosystem/PartnerMarkeeCard'
import { usePartnerMarkees } from '@/lib/contracts/usePartnerMarkees'

export default function EcosystemPage() {
  const { partnerData, isLoading, error } = usePartnerMarkees()

  // Separate cooperative from partners
  const cooperative = partnerData.find(p => p.partner.isCooperative)
  const partners = partnerData.filter(p => !p.partner.isCooperative)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden">
        {/* Cosmic background */}
        <HeroBackground />
        
        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-6">Markee is coming soon to a platform near you...</h1>
          <p className="text-xl md:text-2xl text-[#8A8FBF] mb-8 max-w-3xl mx-auto">
            Join the growing list of platforms integrating Markee to their site.
          </p>
        </div>
      </section>

      {/* Partner Cards Section */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Direct to Cooperative Section */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8">Direct to Cooperative</h2>
            
            {isLoading ? (
              <div className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse">
                <div className="h-48 bg-[#1A1F4D] rounded" />
              </div>
            ) : cooperative ? (
              <PartnerMarkeeCard
                partner={cooperative.partner}
                winningMarkee={cooperative.winningMarkee ?? undefined}
                totalFunds={cooperative.totalFunds}
                markeeCount={cooperative.markeeCount}
              />
            ) : (
              <div className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 text-center">
                <p className="text-[#8A8FBF]">Cooperative data not available</p>
              </div>
            )}
          </div>

          {/* Platform Partners Section */}
          <div>
            <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8">Platform Partners</h2>
            
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse">
                    <div className="h-48 bg-[#1A1F4D] rounded" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 text-center">
                <p className="text-[#FF8E8E]">Error loading partners: {error.message}</p>
              </div>
            ) : partners.length === 0 ? (
              <div className="bg-[#0A0F3D] rounded-lg p-12 border border-[#8A8FBF]/20 text-center">
                <div className="text-6xl mb-4">🤝</div>
                <p className="text-[#8A8FBF] text-lg">No platform partners yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {partners.map(({ partner, winningMarkee, totalFunds, markeeCount }) => (
                  <PartnerMarkeeCard
                    key={partner.slug}
                    partner={partner}
                    winningMarkee={winningMarkee ?? undefined}
                    totalFunds={totalFunds}
                    markeeCount={markeeCount}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-b from-[#060A2A] to-[#0A0F3D]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-[#EDEEFF] mb-6">
            Want to integrate Markee?
          </h2>
          <p className="text-xl text-[#8A8FBF] mb-8">
            Partner with us to bring transparent funding and community ownership to your platform
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://discord.gg/markee"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#F897FE] text-[#060A2A] px-8 py-4 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
            >
              Join Discord
            </a>
            <a
              href="https://docs.markee.xyz/partners"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#0A0F3D] text-[#EDEEFF] px-8 py-4 rounded-lg font-semibold border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors"
            >
              Read Partner Docs
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
