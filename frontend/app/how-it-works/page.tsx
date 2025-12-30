'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { ChevronDown } from 'lucide-react'

export default function HowItWorks() {
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
              <Link href="/how-it-works" className="text-[#F897FE] font-medium">How it Works</Link>
              <Link href="/ecosystem" className="text-[#B8B6D9] hover:text-[#F897FE]">Ecosystem</Link>
              <Link href="/owners" className="text-[#B8B6D9] hover:text-[#F897FE]">Owners</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* What is Markee - Conceptual Opening */}
      <section className="bg-[#0A0F3D] py-16 border-b border-[#8A8FBF]/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-8">What is Markee?</h1>
          <div className="space-y-4 text-lg text-[#B8B6D9]">
            <p className="flex items-start gap-3">
              <span className="text-[#F897FE] font-bold">•</span>
              <span>Markee is open source marketing: <strong className="text-[#EDEEFF]">a message anyone can pay to edit.</strong></span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-[#F897FE] font-bold">•</span>
              <span>It's owned by an open source organization: <strong className="text-[#EDEEFF]">a Digital Cooperative.</strong></span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-[#F897FE] font-bold">•</span>
              <span>And earns money through open source revenue generation: <strong className="text-[#EDEEFF]">RevNets on Ethereum.</strong></span>
            </p>
          </div>
          
          <div className="mt-8 flex gap-4">
            <Link 
              href="/owners"
              className="inline-block bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
            >
              Learn About Ownership
            </Link>
            <Link 
              href="/ecosystem"
              className="inline-block bg-[#060A2A] text-[#7C9CFF] border-2 border-[#7C9CFF] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF]/10 transition-colors"
            >
              View Ecosystem
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing Strategies */}
      <section className="py-16 bg-[#060A2A] border-b border-[#8A8FBF]/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8">Pricing Strategies</h2>
          
          <div className="space-y-6">
            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-6 border-l-4 border-[#F897FE]">
              <h3 className="text-xl font-bold text-[#EDEEFF] mb-3">Leaderboard Strategy</h3>
              <p className="text-[#B8B6D9] mb-3">
                Competitive bidding where the highest total investment displays their message. Each contribution adds to your total and moves you up the leaderboard.
              </p>
              <p className="text-sm text-[#8A8FBF]">
                <strong className="text-[#B8B6D9]">Use case:</strong> Organizations and early believers investing in the cooperative's future
              </p>
            </div>

            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-6 border-l-4 border-[#7C9CFF]">
              <h3 className="text-xl font-bold text-[#EDEEFF] mb-3">Fixed Price Strategy</h3>
              <p className="text-[#B8B6D9] mb-3">
                Set price per message change. Pay once to update the message - simple and predictable pricing.
              </p>
              <p className="text-sm text-[#8A8FBF]">
                <strong className="text-[#B8B6D9]">Use case:</strong> Platform integrations where communities set their own pricing
              </p>
            </div>

            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-6 border-l-4 border-[#7B6AF4] opacity-60">
              <h3 className="text-xl font-bold text-[#EDEEFF] mb-3">Platform Integration Strategy <span className="text-sm font-normal text-[#8A8FBF]">(Coming Q2 2026)</span></h3>
              <p className="text-[#B8B6D9] mb-3">
                Seamlessly integrated into existing platforms with custom revenue sharing and community funding options.
              </p>
              <p className="text-sm text-[#8A8FBF]">
                <strong className="text-[#B8B6D9]">Use case:</strong> DAOs, communities, and platforms monetizing their digital spaces
              </p>
            </div>
          </div>

          <div className="mt-8 bg-[#0A0F3D] rounded-lg p-6 border border-[#8A8FBF]/20">
            <p className="text-[#B8B6D9]">
              <strong className="text-[#EDEEFF]">Learn more:</strong> Check out our <Link href="https://revnet.eth.sucks/" target="_blank" className="text-[#F897FE] hover:underline font-semibold">RevNet documentation</Link> to understand how revenue flows through the ecosystem, or explore our <Link href="/ecosystem" className="text-[#F897FE] hover:underline font-semibold">Ecosystem page</Link> to see platform integrations.
            </p>
          </div>
        </div>
      </section>

      {/* Money Flow Diagrams */}
      <section className="py-16 bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-12 text-center">How Money Flows</h2>
          <MoneyFlowDiagrams />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8">Frequently Asked Questions</h2>
          <FAQAccordion />
        </div>
      </section>

      {/* CTA Footer */}
      <section className="bg-[#F897FE] py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-[#060A2A] mb-4">Ready to create your Markee?</h2>
          <p className="text-[#060A2A] opacity-90 mb-8 text-lg">Buy a Message and become part of our cooperative</p>
          <Link 
            href="/"
            className="inline-block bg-[#060A2A] text-[#F897FE] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#0A0F3D] transition-colors"
          >
            Buy a Message
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}

function MoneyFlowDiagrams() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'website' | 'platform'>('leaderboard')

  return (
    <div>
      <div className="flex gap-4 mb-8 justify-center">
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'leaderboard' 
              ? 'bg-[#F897FE] text-[#060A2A]' 
              : 'bg-[#0A0F3D] text-[#B8B6D9] hover:bg-[#172090] border border-[#8A8FBF]/20'
          }`}
        >
          Leaderboard Markee
        </button>
        <button
          onClick={() => setActiveTab('website')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'website' 
              ? 'bg-[#F897FE] text-[#060A2A]' 
              : 'bg-[#0A0F3D] text-[#B8B6D9] hover:bg-[#172090] border border-[#8A8FBF]/20'
          }`}
        >
          Website Integrated Markees
        </button>
        <button
          onClick={() => setActiveTab('platform')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'platform' 
              ? 'bg-[#F897FE] text-[#060A2A]' 
              : 'bg-[#0A0F3D] text-[#B8B6D9] hover:bg-[#172090] border border-[#8A8FBF]/20'
          }`}
        >
          Platform Integrated Markees
        </button>
      </div>

      <div className="bg-[#060A2A] rounded-lg p-8 shadow-md border border-[#8A8FBF]/20">
        {activeTab === 'leaderboard' && (
          <div className="flex justify-center">
            <img 
              src="/leaderboard-funding.png" 
              alt="Leaderboard Markee Funding Flow" 
              className="max-w-full h-auto"
            />
          </div>
        )}
        {activeTab === 'website' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-6xl mb-4">🏗️</div>
            <h3 className="text-2xl font-bold text-[#EDEEFF] mb-2">Coming Soon</h3>
            <p className="text-[#8A8FBF] text-center max-w-md">
              Website integrated Markees launching Q1 2026
            </p>
          </div>
        )}
        {activeTab === 'platform' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-6xl mb-4">🏗️</div>
            <h3 className="text-2xl font-bold text-[#EDEEFF] mb-2">Coming Soon</h3>
            <p className="text-[#8A8FBF] text-center max-w-md">
              Platform integrated Markees launching Q2 2026
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const faqs = [
    {
      question: "Who is Markee for?",
      answer: (
        <div className="space-y-4">
          <p className="font-semibold text-[#EDEEFF]">Right now:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-[#EDEEFF]">Organizations & DAOs</strong> - Invest via the leaderboard, get RevNet ownership + visibility</li>
            <li><strong className="text-[#EDEEFF]">Individuals</strong> - Early believers who want ownership in web3's open-source marketing infrastructure</li>
          </ul>
          <p className="font-semibold text-[#EDEEFF] mt-4">In the future (Q1 2026+):</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-[#EDEEFF]">Advertisers & Brands</strong> - Traditional digital ad buyers promoting products/services</li>
            <li><strong className="text-[#EDEEFF]">Community Members</strong> - Passionate supporters who want their voice featured + to donate to communities they care about</li>
            <li><strong className="text-[#EDEEFF]">Platforms & Communities</strong> - Monetize digital spaces with transparent, on-chain revenue</li>
          </ul>
        </div>
      )
    },
    {
      question: "What is a RevNet?",
      answer: (
        <div className="space-y-4">
          <p><strong className="text-[#EDEEFF]">RevNets = 100% automated tokenized revenue</strong></p>
          <p>Built on Juicebox crowdfunding smart contracts, RevNets apply these concepts to revenue-generating digital cooperatives with preset terms for how revenue is shared between founders, investors, platform partners, and end users.</p>
          <p className="text-sm text-[#8A8FBF]">Learn more: <a href="https://revnet.eth.sucks/" target="_blank" rel="noopener noreferrer" className="text-[#F897FE] hover:underline">revnet.eth.sucks</a></p>
        </div>
      )
    },
    {
      question: "Where does the money go?",
      answer: (
        <div className="space-y-6">
          <div>
            <p className="font-semibold text-[#EDEEFF]">1. Leaderboard Markees (Live Now)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>100% of funds → RevNet</li>
              <li>68% of RevNet tokens → Buyer</li>
              <li>32% of RevNet tokens → Cooperative</li>
            </ul>
            <p className="text-sm text-[#8A8FBF] mt-2">This is direct RevNet investment - the only way to join during phase 0.</p>
          </div>
          <div>
            <p className="font-semibold text-[#EDEEFF]">2. Website Plugin Markees (Q1 2026)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>68% of payment → Website owner (fee receiver)</li>
              <li>32% of payment → RevNet</li>
              <li>68% of RevNet tokens → Buyer</li>
              <li>32% of RevNet tokens → Cooperative</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#EDEEFF]">3. Platform Integrated Markees (Q2 2026+)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>68% of payment → Community (set by platform user)</li>
              <li>32% of payment → RevNet</li>
              <li>68% of RevNet tokens → Platform</li>
              <li>32% of RevNet tokens → Cooperative</li>
              <li>Within cooperative's share: 32% to buyer, 68% to all token holders</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      question: "What's the roadmap?",
      answer: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-[#EDEEFF]">Q4 2025 - Phase 0 Fundraising</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>RevNet opens at lowest price (50,000 tokens/ETH)</li>
              <li>Leaderboard goes live on Optimism</li>
              <li>Waitlist opens for platform integration partners</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#EDEEFF]">Q1 2026 - Gardens Launch</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>First platform integration with Gardens</li>
              <li>Website plugin released for manual integration</li>
              <li>Cooperative governance begins</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#EDEEFF]">Q2 2026 & Beyond</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Additional platform integrations</li>
              <li>Revenue scales across ecosystem</li>
              <li>Returns flow to token holders</li>
              <li>Global expansion of open-source digital marketing</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      question: "Who's building Markee?",
      answer: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-[#EDEEFF]">Core Team</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Paul - Founder</li>
              <li>Gossman - Lead Developer</li>
              <li>Mati - Lead Frontend</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#EDEEFF]">Advisors</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Felipe - Smart Contract Security Expert</li>
              <li>Jango - RevNets Founder</li>
            </ul>
          </div>
        </div>
      )
    }
  ]
  
  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => (
        <div key={index} className="bg-[#0A0F3D] rounded-lg shadow-sm border border-[#8A8FBF]/20 overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="w-full px-6 py-4 flex justify-between items-center hover:bg-[#172090] transition-colors"
          >
            <span className="font-semibold text-[#EDEEFF] text-left">{faq.question}</span>
            <ChevronDown 
              size={20} 
              className={`text-[#8A8FBF] transition-transform flex-shrink-0 ml-4 ${
                openIndex === index ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openIndex === index && (
            <div className="px-6 py-4 bg-[#060A2A] border-t border-[#8A8FBF]/20 text-[#B8B6D9]">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
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
