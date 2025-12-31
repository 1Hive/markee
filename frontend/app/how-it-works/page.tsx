'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="how-it-works" />

      {/* What is Markee - Hero Section */}
      <section className="relative py-24 overflow-hidden border-b border-[#8A8FBF]/20">
        {/* Cosmic background */}
        <HeroBackground />
        
        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
