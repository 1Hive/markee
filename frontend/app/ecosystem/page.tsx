'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { PartnerMarkeeCard } from '@/components/ecosystem/PartnerMarkeeCard'
import { usePartnerMarkees } from '@/lib/contracts/usePartnerMarkees'

export default function Ecosystem() {
  const { partnerData, isLoading, error } = usePartnerMarkees()

  // Separate cooperative from partners
  const cooperative = partnerData.find(p => p.partner.isCooperative)
  const partners = partnerData.filter(p => !p.partner.isCooperative)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#172090] to-[#4B3ACC] py-16 border-b border-[#8A8FBF]/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-6">Markee Ecosystem</h1>
          <p className="text-xl text-[#B8B6D9] mb-8">
            A growing network of platforms and communities using Markee to monetize their digital real estate.
          </p>
        </div>
      </section>

      {/* Loading State */}
      {isLoading && (
        <section className="py-16 bg-[#0A0F3D]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#F897FE] mb-4"></div>
              <p className="text-[#8A8FBF]">Loading ecosystem...</p>
            </div>
          </div>
        </section>
      )}

      {/* Error State */}
      {error && (
        <section className="py-16 bg-[#0A0F3D]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 max-w-lg mx-auto text-center">
              <p className="text-[#8BC8FF] font-medium mb-2">Error loading ecosystem</p>
              <p className="text-[#8A8FBF] text-sm">{error.message}</p>
            </div>
          </div>
        </section>
      )}

      {/* Markee Cooperative - Full Width at Top */}
      {!isLoading && !error && cooperative && (
        <section className="py-12 bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[#EDEEFF] mb-6">Direct to Cooperative</h2>
            <div className="max-w-2xl mx-auto">
              <PartnerMarkeeCard
                partner={cooperative.partner}
                winningMarkee={cooperative.winningMarkee}
                totalFunds={cooperative.totalFunds}
                isCooperative={true}
              />
            </div>
          </div>
        </section>
      )}

      {/* Partner Integrations - Grid of 4 */}
      {!isLoading && !error && partners.length > 0 && (
        <section className="py-16 bg-[#060A2A]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#EDEEFF] mb-2">Platform Partners</h2>
              <p className="text-[#8A8FBF]">
                Communities and platforms with integrated Markees
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {partners.map((data) => (
                <PartnerMarkeeCard
                  key={data.partner.slug}
                  partner={data.partner}
                  winningMarkee={data.winningMarkee}
                  totalFunds={data.totalFunds}
                  isCooperative={false}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Add Your Platform CTA */}
      <section className="py-16 bg-gradient-to-br from-[#172090] to-[#4B3ACC]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-[#0A0F3D] rounded-xl shadow-lg border border-[#8A8FBF]/20 p-8 md:p-12 text-center">
            <div className="text-5xl mb-6">🚀</div>
            <h2 className="text-3xl font-bold text-[#EDEEFF] mb-4">Want Markee on Your Platform?</h2>
            <p className="text-lg text-[#B8B6D9] mb-8 max-w-2xl mx-auto">
              Join our waitlist to integrate Markee into your platform or community. Get early access, technical support, and help shape the future of open-source digital marketing.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-center gap-3 text-[#B8B6D9]">
                <span className="text-[#F897FE]">✓</span>
                <span>Priority integration support</span>
              </div>
              <div className="flex items-center justify-center gap-3 text-[#B8B6D9]">
                <span className="text-[#F897FE]">✓</span>
                <span>Custom revenue sharing options</span>
              </div>
              <div className="flex items-center justify-center gap-3 text-[#B8B6D9]">
                <span className="text-[#F897FE]">✓</span>
                <span>Technical documentation and APIs</span>
              </div>
            </div>

            <a 
              href="mailto:hello@markee.xyz?subject=Platform%20Integration%20Waitlist"
              className="inline-block bg-[#F897FE] text-[#060A2A] px-8 py-4 rounded-lg font-semibold text-lg hover:bg-[#7C9CFF] transition-colors mb-4"
            >
              Join the Waitlist
            </a>
            <p className="text-sm text-[#8A8FBF]">
              Or email us directly at{' '}
              <a href="mailto:hello@markee.xyz" className="text-[#F897FE] hover:underline font-semibold">
                hello@markee.xyz
              </a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
