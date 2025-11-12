'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { ChevronDown } from 'lucide-react'

// Phase configuration
const PHASES = [
  { 
    phase: 0, 
    rate: 50000, 
    endDate: new Date('2025-12-21T00:00:00Z'),
    label: 'Phase 0',
    color: 'bg-markee'
  },
  { 
    phase: 1, 
    rate: 30000, 
    endDate: new Date('2026-03-21T00:00:00Z'),
    label: 'Phase 1',
    color: 'bg-markee-600'
  },
  { 
    phase: 2, 
    rate: 24000, 
    endDate: new Date('2026-06-21T00:00:00Z'),
    label: 'Phase 2',
    color: 'bg-markee-700'
  },
  { 
    phase: 3, 
    rate: 20000, 
    endDate: new Date('2026-09-21T00:00:00Z'),
    label: 'Phase 3',
    color: 'bg-markee-800'
  },
  { 
    phase: 4, 
    rate: 17000, 
    endDate: new Date('2026-12-21T00:00:00Z'),
    label: 'Phase 4',
    color: 'bg-markee-900'
  },
]

function getCurrentPhase() {
  const now = new Date()
  for (let i = 0; i < PHASES.length; i++) {
    if (now < PHASES[i].endDate) {
      return i
    }
  }
  return PHASES.length - 1
}

export default function InfoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
            </Link>
            <nav className="flex gap-6">
              <Link href="/" className="text-gray-600 hover:text-gray-900">Leaderboard</Link>
              <Link href="/info" className="text-markee font-medium">Info</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* What is Markee - Conceptual Opening */}
      <section className="bg-white py-16 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">What is Markee?</h1>
          <div className="space-y-4 text-lg text-gray-700">
            <p className="flex items-start gap-3">
              <span className="text-markee font-bold">•</span>
              <span>Markee is open source marketing: <strong>a message anyone can pay to edit.</strong></span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-markee font-bold">•</span>
              <span>It's owned by an open source organization: <strong>a Digital Cooperative.</strong></span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-markee font-bold">•</span>
              <span>And earns money through open source revenue generation: <strong>RevNets on Ethereum.</strong></span>
            </p>
          </div>
        </div>
      </section>

      {/* Integration Partners - Coming Soon */}
      <section className="bg-gradient-to-br from-markee-50 to-green-50 py-12 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Coming Soon to...</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 items-center mb-8">
            <PartnerLogo src="/partners/gardens.png" alt="Gardens" />
            <PartnerLogo src="/partners/juicebox.png" alt="Juicebox" />
            <PartnerLogo src="/partners/revnets.png" alt="RevNets" />
          </div>
          <div className="text-center mt-8 bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Want a Markee on your site?</h3>
            <p className="text-gray-600 mb-4">
              Join the waitlist and be among the first to get a Markee for your digital space.
            </p>
            <a 
              href="mailto:hello@markee.xyz?subject=Platform%20Integration%20Waitlist"
              className="inline-block bg-markee text-white px-6 py-3 rounded-lg font-semibold hover:bg-markee-600 transition-colors"
            >
              Join the Waitlist
            </a>
            <p className="text-sm text-gray-500 mt-3">
              Email us at <a href="mailto:hello@markee.xyz" className="text-markee hover:underline">hello@markee.xyz</a>
            </p>
          </div>
        </div>
      </section>

      {/* Countdown and Phase Visualization Section */}
      <section className="bg-gradient-to-br from-gray-50 to-markee-50 py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CountdownTimer />
          <PhaseVisualization />
        </div>
      </section>

      {/* Money Flow Diagrams */}
      <section className="py-16 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">How Money Flows</h2>
          <MoneyFlowDiagrams />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Frequently Asked Questions</h2>
          <FAQAccordion />
        </div>
      </section>

      {/* CTA Footer */}
      <section className="bg-markee py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to create your Markee?</h2>
          <p className="text-white opacity-90 mb-8 text-lg">Buy a Message and become part of our cooperative</p>
          <Link 
            href="/"
            className="inline-block bg-white text-markee px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-50 transition-colors"
          >
            Buy a Message
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center">
            <div className="flex gap-6 mb-4">
              {/* X (Twitter) */}
              <a 
                href="https://x.com/markee_xyz" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-markee transition-colors"
                aria-label="X (Twitter)"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              
              {/* Discord */}
              <a 
                href="https://discord.gg/markee" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-markee transition-colors"
                aria-label="Discord"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
              
              {/* Telegram */}
              <a 
                href="https://t.me/markee_xyz" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-markee transition-colors"
                aria-label="Telegram"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12a12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472c-.18 1.898-.962 6.502-1.36 8.627c-.168.9-.499 1.201-.82 1.23c-.696.065-1.225-.46-1.9-.902c-1.056-.693-1.653-1.124-2.678-1.8c-1.185-.78-.417-1.21.258-1.91c.177-.184 3.247-2.977 3.307-3.23c.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345c-.48.33-.913.49-1.302.48c-.428-.008-1.252-.241-1.865-.44c-.752-.245-1.349-.374-1.297-.789c.027-.216.325-.437.893-.663c3.498-1.524 5.83-2.529 6.998-3.014c3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
              
              {/* Farcaster */}
              <a 
                href="https://warpcast.com/markee" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-markee transition-colors"
                aria-label="Farcaster"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.24 6.24h-2.226v11.376h2.226V6.24zm-4.596 0H10.67v11.376h2.974V6.24zM5.76 6.24H3.534v11.376H5.76V6.24zm-.29 13.38H3.243v1.14H5.47v-1.14zm13.29 0h-2.226v1.14h2.226v-1.14zm-4.887 0h-2.707v1.14h2.707v-1.14zM3.243 3.24h2.226V4.38H3.243V3.24zm4.427 0h2.974V4.38H7.67V3.24zm6.073 0h2.226V4.38h-2.226V3.24z"/>
                </svg>
              </a>
            </div>
            
            <div className="text-sm text-gray-400">
              © 2025 Markee
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function PartnerLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex items-center justify-center h-32 p-6">
      <img src={src} alt={alt} className="max-h-20 max-w-full object-contain" />
    </div>
  )
}

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const currentPhaseIndex = getCurrentPhase()
  const currentPhase = PHASES[currentPhaseIndex]

  useEffect(() => {
    function updateCountdown() {
      const now = new Date()
      const difference = currentPhase.endDate.getTime() - now.getTime()

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        })
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [currentPhase.endDate])

  return (
    <div className="text-center mb-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Join the Cooperative by getting MARKEE tokens
      </h2>
      <p className="text-gray-600 mb-6">Price increases in:</p>
      <div className="flex justify-center gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-markee">{timeLeft.days}</div>
          <div className="text-sm text-gray-600">Days</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-markee">{timeLeft.hours}</div>
          <div className="text-sm text-gray-600">Hours</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-markee">{timeLeft.minutes}</div>
          <div className="text-sm text-gray-600">Minutes</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-markee">{timeLeft.seconds}</div>
          <div className="text-sm text-gray-600">Seconds</div>
        </div>
      </div>
    </div>
  )
}

function PhaseVisualization() {
  const currentPhaseIndex = getCurrentPhase()
  const now = new Date()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">MARKEE Token Stages</h3>

        {/* Progress Bar */}
        <div className="relative mb-8">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-markee via-markee-600 to-markee-700 transition-all duration-1000"
              style={{ 
                width: `${((currentPhaseIndex + 1) / PHASES.length) * 100}%` 
              }}
            />
          </div>
        </div>

        {/* Phase Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {PHASES.map((phase, index) => {
            const isPast = now > phase.endDate
            const isCurrent = index === currentPhaseIndex
            const isFuture = index > currentPhaseIndex

            return (
              <div
                key={phase.phase}
                className={`relative rounded-lg p-4 border-2 transition-all ${
                  isCurrent
                    ? 'border-markee bg-markee-50 shadow-lg scale-105'
                    : isPast
                    ? 'border-gray-300 bg-gray-100 opacity-60'
                    : 'border-gray-300 bg-white opacity-50'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-markee text-white text-xs font-bold px-3 py-1 rounded-full">
                      ACTIVE
                    </span>
                  </div>
                )}

                <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${phase.color}`} />

                <div className="text-center">
                  <div className={`text-sm font-semibold mb-1 ${
                    isCurrent ? 'text-markee' : 'text-gray-600'
                  }`}>
                    {phase.label}
                  </div>
                  <div className={`text-2xl font-bold mb-1 ${
                    isCurrent ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {phase.rate.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">MARKEE / ETH</div>
                  <div className="text-xs text-gray-400 mt-2">
                    {isPast ? 'Ended' : isFuture ? 'Upcoming' : 'Ends'} {phase.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 text-center">
          <Link 
            href="/"
            className="bg-markee text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-markee-600 transition-colors inline-block"
          >
            Buy a Message to Join
          </Link>
          <p className="text-sm text-gray-500 mt-2">
            Stages are preset in the Cooperative's RevNet.
          </p>
        </div>
      </div>
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
              ? 'bg-markee text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Leaderboard Markee
        </button>
        <button
          onClick={() => setActiveTab('website')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'website' 
              ? 'bg-markee text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Website Integrated Markees
        </button>
        <button
          onClick={() => setActiveTab('platform')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'platform' 
              ? 'bg-markee text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Platform Integrated Markees
        </button>
      </div>

      <div className="bg-white rounded-lg p-8 shadow-md border border-gray-200">
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
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h3>
            <p className="text-gray-600 text-center max-w-md">
              Website integrated Markees launching Q1 2026
            </p>
          </div>
        )}
        {activeTab === 'platform' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-6xl mb-4">🏗️</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h3>
            <p className="text-gray-600 text-center max-w-md">
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
          <p className="font-semibold">Right now:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Organizations & DAOs</strong> - Invest via the leaderboard, get RevNet ownership + visibility</li>
            <li><strong>Individuals</strong> - Early believers who want ownership in web3's open-source marketing infrastructure</li>
          </ul>
          <p className="font-semibold mt-4">In the future (Q1 2026+):</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Advertisers & Brands</strong> - Traditional digital ad buyers promoting products/services</li>
            <li><strong>Community Members</strong> - Passionate supporters who want their voice featured + to donate to communities they care about</li>
            <li><strong>Platforms & Communities</strong> - Monetize digital spaces with transparent, on-chain revenue</li>
          </ul>
        </div>
      )
    },
    {
      question: "What is a RevNet?",
      answer: (
        <div className="space-y-4">
          <p><strong>RevNets = 100% automated tokenized revenue</strong></p>
          <p>Built on Juicebox crowdfunding smart contracts, RevNets apply these concepts to revenue-generating digital cooperatives with preset terms for how revenue is shared between founders, investors, platform partners, and end users.</p>
          <p className="text-sm text-gray-600">Learn more: <a href="https://revnet.eth.sucks/" target="_blank" rel="noopener noreferrer" className="text-markee hover:underline">revnet.eth.sucks</a></p>
        </div>
      )
    },
    {
      question: "What are the RevNet terms?",
      answer: (
        <div className="space-y-4">
          <p><strong>Token Issuance:</strong> Starts at 50,000 tokens per ETH and decreases seasonally over 5 phases to ~17,000 tokens per ETH.</p>
          <p><strong>Initial Allocation:</strong> 50,000,000 tokens minted to Markee LLC at launch. This is the first and last issuance the LLC ever receives from the RevNet.</p>
          <p><strong>Reserve Rate:</strong> 38% distributed to the cooperative. Initially, all cooperative tokens go into a funding pool on Gardens governed by the co-op.</p>
          <p><strong>Governance:</strong> The cooperative's Board of Directors (elected by token holders) can adjust distribution settings.</p>
          <p className="text-sm text-gray-600">View full terms: <a href="https://app.revnet.eth.sucks/v5:op:46/terms" target="_blank" rel="noopener noreferrer" className="text-markee hover:underline">app.revnet.eth.sucks/v5:op:46/terms</a></p>
        </div>
      )
    },
    {
      question: "What is the ownership structure?",
      answer: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold">Markee LLC (Wyoming Series LLC)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Owned by the founders</li>
              <li>One-time allocation of 50M RevNet tokens at launch</li>
              <li>No further RevNet allocations</li>
              <li>Operates the platform</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Markee LCA (Colorado Limited Cooperative Association)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Owned by RevNet token holders</li>
              <li>Receives 32% of all future RevNet tokens from revenue</li>
              <li>Board of Directors elected by token holders</li>
              <li>Governance via Gardens with onchain covenant</li>
              <li>Token holders can participate in cooperative governance</li>
            </ul>
          </div>
          <p className="mt-4"><strong>Key Point:</strong> As revenue grows and/or the LLC redeems its allocation for expenses, ownership progressively shifts toward the cooperative.</p>
        </div>
      )
    },
    {
      question: "Where does the money go?",
      answer: (
        <div className="space-y-6">
          <div>
            <p className="font-semibold">1. Leaderboard Markees (Live Now)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>100% of funds → RevNet</li>
              <li>68% of RevNet tokens → Buyer</li>
              <li>32% of RevNet tokens → Cooperative</li>
            </ul>
            <p className="text-sm text-gray-600 mt-2">This is direct RevNet investment - the only way to join during phase 0.</p>
          </div>
          <div>
            <p className="font-semibold">2. Website Plugin Markees (Q1 2026)</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>68% of payment → Website owner (fee receiver)</li>
              <li>32% of payment → RevNet</li>
              <li>68% of RevNet tokens → Buyer</li>
              <li>32% of RevNet tokens → Cooperative</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">3. Platform Integrated Markees (Q2 2026+)</p>
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
            <p className="font-semibold">Q4 2025 - Phase 0 Fundraising</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>RevNet opens at lowest price (50,000 tokens/ETH)</li>
              <li>Leaderboard goes live on Optimism</li>
              <li>Waitlist opens for platform integration partners</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Q1 2026 - Gardens Launch</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>First platform integration with Gardens</li>
              <li>Website plugin released for manual integration</li>
              <li>Cooperative governance begins</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Q2 2026 & Beyond</p>
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
            <p className="font-semibold">Core Team</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Paul - Founder</li>
              <li>Gossman - Lead Developer</li>
              <li>Mati - Lead Frontend</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Advisors</p>
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
        <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="w-full px-6 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-900 text-left">{faq.question}</span>
            <ChevronDown 
              size={20} 
              className={`text-gray-500 transition-transform flex-shrink-0 ml-4 ${
                openIndex === index ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openIndex === index && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-gray-700">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
