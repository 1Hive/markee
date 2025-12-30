'use client'

import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/ConnectButton'

export default function Ecosystem() {
  return (
    <div className="min-h-screen bg-[#060A2A]">
      {/* Header */}
      <header className="bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
            </Link>
            <nav className="flex gap-6">
              <Link href="/how-it-works" className="text-[#B8B6D9] hover:text-[#F897FE]">How it Works</Link>
              <Link href="/ecosystem" className="text-[#F897FE] font-medium">Ecosystem</Link>
              <Link href="/owners" className="text-[#B8B6D9] hover:text-[#F897FE]">Owners</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#172090] to-[#4B3ACC] py-16 border-b border-[#8A8FBF]/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-6">Markee Ecosystem</h1>
          <p className="text-xl text-[#B8B6D9] mb-8">
            A growing network of platforms and communities using Markee to monetize their digital real estate for their users and themselves.
          </p>
        </div>
      </section>

      {/* Active Markees */}
      <section className="py-16 bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8 text-center">Live Markees</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Markee Home */}
            <Link href="/" className="group">
              <div className="bg-[#060A2A] rounded-lg shadow-md border-2 border-[#F897FE]/30 hover:border-[#F897FE] hover:shadow-lg hover:shadow-[#F897FE]/20 transition-all p-6">
                <div className="flex items-center gap-4 mb-4">
                  <img src="/markee-logo.png" alt="Markee" className="h-12 w-auto" />
                  <div>
                    <h3 className="text-xl font-bold text-[#EDEEFF] group-hover:text-[#F897FE] transition-colors">Markee Home</h3>
                    <p className="text-sm text-[#8A8FBF]">markee.xyz</p>
                  </div>
                </div>
                <p className="text-[#B8B6D9] mb-4">
                  The home leaderboard where early believers invest directly into the Cooperative's RevNet. All funds flow 100% to the RevNet.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#F897FE]">View Leaderboard →</span>
                  <span className="text-xs text-[#8A8FBF]">Leaderboard Strategy</span>
                </div>
              </div>
            </Link>

            {/* Fixed Price Demo */}
            <div className="bg-[#060A2A] rounded-lg shadow-md border-2 border-[#7C9CFF]/30 hover:border-[#7C9CFF] hover:shadow-lg hover:shadow-[#7C9CFF]/20 transition-all p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 bg-[#7C9CFF]/20 rounded-lg flex items-center justify-center text-2xl">
                  🪧
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#EDEEFF]">Fixed Price Messages</h3>
                  <p className="text-sm text-[#8A8FBF]">markee.xyz</p>
                </div>
              </div>
              <p className="text-[#B8B6D9] mb-4">
                Simple, set-price messages anyone can update. Perfect for community announcements and rotating content.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#7C9CFF]">See on Homepage →</span>
                <span className="text-xs text-[#8A8FBF]">Fixed Strategy</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Coming Soon Integrations */}
      <section className="py-16 bg-[#060A2A] border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-4 text-center">Platform Integrations</h2>
          <p className="text-center text-[#8A8FBF] mb-12 max-w-3xl mx-auto">
            We're working with leading web3 platforms to bring Markee to their communities. These integrations will enable seamless revenue sharing and community funding.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <PartnerCard 
              logo="/partners/gardens.png"
              name="Gardens"
              status="Q1 2026"
              description="Governance platform for DAOs"
            />
            <PartnerCard 
              logo="/partners/juicebox.png"
              name="Juicebox"
              status="Q1 2026"
              description="Crowdfunding protocol"
            />
            <PartnerCard 
              logo="/partners/revnets.png"
              name="RevNets"
              status="Q2 2026"
              description="Revenue-generating networks"
            />
            <PartnerCard 
              logo="/partners/breadcoop.png"
              name="Bread Coop"
              status="Q2 2026"
              description="Digital cooperative platform"
            />
          </div>

          <div className="bg-[#0A0F3D] rounded-lg shadow-md p-8 max-w-3xl mx-auto border border-[#8A8FBF]/20">
            <h3 className="text-xl font-bold text-[#EDEEFF] mb-4">What's Coming with Platform Integrations</h3>
            <ul className="space-y-3 text-[#B8B6D9]">
              <li className="flex items-start gap-3">
                <span className="text-[#F897FE] font-bold mt-1">✓</span>
                <span><strong className="text-[#EDEEFF]">Native Integration:</strong> Markees embedded directly in platform UI</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#F897FE] font-bold mt-1">✓</span>
                <span><strong className="text-[#EDEEFF]">Custom Revenue Splits:</strong> Platforms set their own community funding ratios</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#F897FE] font-bold mt-1">✓</span>
                <span><strong className="text-[#EDEEFF]">Automated Tokenomics:</strong> RevNet handles all payments and token distribution</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#F897FE] font-bold mt-1">✓</span>
                <span><strong className="text-[#EDEEFF]">Community Governance:</strong> Token holders vote on cooperative decisions</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#F897FE] font-bold mt-1">✓</span>
                <span><strong className="text-[#EDEEFF]">Cross-Platform Visibility:</strong> Messages visible across the entire Markee ecosystem</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

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

function PartnerCard({ logo, name, status, description }: { logo: string; name: string; status: string; description: string }) {
  return (
    <div className="bg-[#0A0F3D] rounded-lg shadow-md p-6 border border-[#8A8FBF]/30 hover:border-[#F897FE] transition-all group">
      <div className="flex flex-col items-center text-center">
        <img src={logo} alt={name} className="h-16 object-contain mb-4 group-hover:scale-110 transition-transform" />
        <h3 className="font-bold text-[#EDEEFF] mb-1">{name}</h3>
        <p className="text-xs text-[#8A8FBF] mb-2">{description}</p>
        <span className="text-xs font-semibold text-[#F897FE] bg-[#F897FE]/10 px-3 py-1 rounded-full">
          {status}
        </span>
      </div>
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
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.24 6.24h-2.226v11.376h2.226V6.24zm-4.596 0H10.67v11.376h2.974V6.24zM5.76 6.24H3.534v11.376H5.76V6.24zm-.29 13.38H3.243v1.14H5.47v-1.14zm13.29 0h-2.226v1.14h2.226v-1.14zm-4.887 0h-2.707v1.14h2.707v-1.14zM3.243 3.24h2.226V4.38H3.243V3.24zm4.427 0h2.974V4.38H7.67V3.24zm6.073 0h2.226V4.38h-2.226V3.24z"/>
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
