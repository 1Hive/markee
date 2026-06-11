'use client'

import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default function MarketplacePage() {
  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="marketplace" useRegularLinks />
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8A8FBF', fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 14 }}>
          Marketplace — coming soon
        </p>
      </div>
      <Footer />
    </div>
  )
}
