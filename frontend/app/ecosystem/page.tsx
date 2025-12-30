'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { PartnerMarkeeCard } from '@/components/ecosystem/PartnerMarkeeCard'
import { usePartnerMarkees } from '@/hooks/usePartnerMarkees'

export default function Ecosystem() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { partnerData, isLoading, error } = usePartnerMarkees()

  // Separate cooperative from partners
  const cooperative = partnerData.find(p => p.partner.isCooperative)
  const partners = partnerData.filter(p => !p.partner.isCooperative)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      {/* Header */}
      <header className="bg-[#0A0F3D] border-b border-[#8A8FBF]/20 relative z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center">
                <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
              </Link>
              {/* Desktop Navigation */}
              <nav className="hidden md:flex gap-6">
                <Link href="/how-it-works" className="text-[#B8B6D9] hover:text-[#F897FE]">How it Works</Link>
                <Link href="/ecosystem" className="text-[#F897FE] font-medium">Ecosystem</Link>
                <Link href="/owners" className="text-[#B8B6D9] hover:text-[#F897FE]">Owners</Link>
              </nav>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:block">
                <ConnectButton />
              </div>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden text-[#B8B6D9] hover:text-[#F897FE] p-2"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 border-t border-[#8A8FBF]/20 pt-4">
              <nav className="flex flex-col gap-4">
                <Link 
                  href="/how-it-works" 
                  className="text-[#B8B6D9] hover:text-[#F897FE] py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  How it Works
                </Link>
                <Link 
                  href="/ecosystem" 
                  className="text-[#F897FE] font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Ecosystem
                </Link>
                <Link 
                  href="/owners" 
                  className="text-[#B8B6D9] hover:text-[#F897FE] py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Owners
                </Link>
                <div className="pt-2 border-t border-[#8A8FBF]/20">
                  <ConnectButton />
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

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

      {/* Footer */}
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="bg-[#0A0F3D] text-[#EDEEFF] py-8 border-t border-[#8A8FBF]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center">
          <div className="flex gap-6 mb-4">
            <a 
              href="https://x.com/markee_xyz" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#F897FE] transition-colors"
              aria-label="X (Twitter)"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a 
              href="https://discord.gg/UhhRDzwwkM" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#F897FE] transition-colors"
              aria-label="Discord"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
            <a 
              href="https://t.me/+pRiD0TURr5o5ZmUx" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#F897FE] transition-colors"
              aria-label="Telegram"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12a12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472c-.18 1.898-.962 6.502-1.36 8.627c-.168.9-.499 1.201-.82 1.23c-.696.065-1.225-.46-1.9-.902c-1.056-.693-1.653-1.124-2.678-1.8c-1.185-.78-.417-1.21.258-1.91c.177-.184 3.247-2.977 3.307-3.23c.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345c-.48.33-.913.49-1.302.48c-.428-.008-1.252-.241-1.865-.44c-.752-.245-1.349-.374-1.297-.789c.027-.216.325-.437.893-.663c3.498-1.524 5.83-2.529 6.998-3.014c3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </a>
            <a 
              href="https://warpcast.com/markee" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#F897FE] transition-colors"
              aria-label="Farcaster"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" role="img">
                <path d="M18.24.24H5.76C2.5789.24 0 2.8188 0 6v12c0 3.1811 2.5789 5.76 5.76 5.76h12.48c3.1812 0 5.76-2.5789 5.76-5.76V6C24 2.8188 21.4212.24 18.24.24m.8155 17.1662v.504c.2868-.0256.5458.1905.5439.479v.5688h-5.1437v-.5688c-.0019-.2885.2576-.5047.5443-.479v-.504c0-.22.1525-.402.358-.458l-.0095-4.3645c-.1589-1.7366-1.6402-3.0979-3.4435-3.0979-1.8038 0-3.2846 1.3613-3.4435 3.0979l-.0096 4.3578c.2276.0424.5318.2083.5395.4648v.504c.2863-.0256.5457.1905.5438.479v.5688H4.3915v-.5688c-.0019-.2885.2575-.5047.5438-.479v-.504c0-.2529.2011-.4548.4536-.4724v-7.895h-.4905L4.2898 7.008l2.6405-.0005V5.0419h9.9495v1.9656h2.8219l-.6091 2.0314h-.4901v7.8949c.2519.0177.453.2195.453.4724"/>
              </svg>
            </a>
          </div>
          <div className="text-sm text-[#8A8FBF]">
            © 2026 Markee
          </div>
        </div>
      </div>
    </footer>
  )
}
