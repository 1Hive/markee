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
              <span>Markee is open source digital marketing: <strong>a sign anyone can pay to edit.</strong></span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-markee font-bold">•</span>
              <span>It's owned by the open source version of organizational designs: <strong>a Digital Cooperative.</strong></span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-markee font-bold">•</span>
              <span>And earns money through the open source version of revenue generation: <strong>RevNets on Ethereum.</strong></span>
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
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Want Markee on your platform?</h3>
            <p className="text-gray-600 mb-4">
              Join our waitlist for platform integration and be among the first to monetize your digital spaces.
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
          <p className="text-white opacity-90 mb-8 text-lg">Join the leaderboard and become part of the cooperative</p>
          <Link 
            href="/"
            className="inline-block bg-white text-markee px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-50 transition-colors"
          >
            Create Your Markee
          </Link>
        </div>
      </section>
    </div>
  )
}

function PartnerLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 flex items-center justify-center h-32">
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
        Current Rate: {currentPhase.rate.toLocaleString()} $ABC per ETH
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
        <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">Token Price Roadmap</h3>

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
                  <div className="text-xs text-gray-500">$ABC / ETH</div>
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
            Create Your Markee Now
          </Link>
          <p className="text-sm text-gray-500 mt-2">
            Lock in the current rate before it increases
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
          Leaderboard (Now)
        </button>
        <button
          onClick={() => setActiveTab('website')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'website' 
              ? 'bg-markee text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Website Plugin (Q1 2026)
        </button>
        <button
          onClick={() => setActiveTab('platform')}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            activeTab === 'platform' 
              ? 'bg-markee text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Platform Integration (Q2 2026)
        </button>
      </div>

      <div className="bg-white rounded-lg p-8 shadow-md border border-gray-200">
        {activeTab === 'leaderboard' && <LeaderboardFlow />}
        {activeTab === 'website' && <WebsiteFlow />}
        {activeTab === 'platform' && <PlatformFlow />}
      </div>
    </div>
  )
}

function LeaderboardFlow() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-block bg-markee-100 text-markee-800 px-6 py-3 rounded-lg font-semibold text-lg mb-4">
          Your Payment: 1 ETH
        </div>
      </div>
      
      <div className="flex justify-center">
        <div className="text-4xl text-gray-400">↓</div>
      </div>

      <div className="text-center">
        <div className="inline-block bg-green-100 text-green-800 px-6 py-3 rounded-lg font-semibold text-lg mb-4">
          100% to RevNet
        </div>
      </div>

      <div className="flex justify-center gap-12">
        <div className="text-center">
          <div className="text-2xl text-gray-400 mb-2">↙</div>
          <div className="bg-purple-100 text-purple-800 px-6 py-4 rounded-lg">
            <div className="font-bold text-xl mb-2">68%</div>
            <div className="text-sm">You receive tokens</div>
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl text-gray-400 mb-2">↘</div>
          <div className="bg-orange-100 text-orange-800 px-6 py-4 rounded-lg">
            <div className="font-bold text-xl mb-2">32%</div>
            <div className="text-sm">Cooperative receives tokens</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function WebsiteFlow() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-block bg-markee-100 text-markee-800 px-6 py-3 rounded-lg font-semibold text-lg mb-4">
          User Payment: 1 ETH
        </div>
      </div>
      
      <div className="flex justify-center">
        <div className="text-4xl text-gray-400">↓</div>
      </div>

      <div className="flex justify-center gap-12">
        <div className="text-center">
          <div className="text-2xl text-gray-400 mb-2">↙</div>
          <div className="bg-green-100 text-green-800 px-6 py-4 rounded-lg">
            <div className="font-bold text-xl mb-2">68%</div>
            <div className="text-sm">Website Owner</div>
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl text-gray-400 mb-2">↘</div>
          <div className="bg-markee-100 text-markee-800 px-6 py-4 rounded-lg mb-4">
            <div className="font-bold text-xl mb-2">32%</div>
            <div className="text-sm">RevNet</div>
          </div>
          <div className="flex gap-6">
            <div className="bg-purple-100 text-purple-800 px-4 py-2 rounded text-sm">
              <div className="font-bold">68% tokens</div>
              <div>Buyer</div>
            </div>
            <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded text-sm">
              <div className="font-bold">32% tokens</div>
              <div>Cooperative</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlatformFlow() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-block bg-markee-100 text-markee-800 px-6 py-3 rounded-lg font-semibold text-lg mb-4">
          User Payment: 1 ETH
        </div>
      </div>
      
      <div className="flex justify-center">
        <div className="text-4xl text-gray-400">↓</div>
      </div>

      <div className="flex justify-center gap-12">
        <div className="text-center">
          <div className="text-2xl text-gray-400 mb-2">↙</div>
          <div className="bg-green-100 text-green-800 px-6 py-4 rounded-lg">
            <div className="font-bold text-xl mb-2">68%</div>
            <div className="text-sm">Community</div>
            <div className="text-xs text-gray-600">(set by platform user)</div>
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl text-gray-400 mb-2">↘</div>
          <div className="bg-markee-100 text-markee-800 px-6 py-4 rounded-lg mb-4">
            <div className="font-bold text-xl mb-2">32%</div>
            <div className="text-sm">RevNet</div>
          </div>
          <div className="space-y-3">
            <div className="bg-indigo-100 text-indigo-800 px-4 py-2 rounded text-sm">
              <div className="font-bold">68% tokens → Platform</div>
            </div>
            <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded text-sm">
              <div className="font-bold">32% tokens → Cooperative</div>
              <div className="text-xs mt-1 space-y-1">
                <div>32% to buyer</div>
                <div>68% to all token holders</div>
              </div>
            </div>
          </div>
        </div>
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
            <p className="text-sm text-gray-600 mt-2">This is direct RevNet investment - the only way to buy in during angel phase.</p>
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
            <p className="font-semibold">Q4 2025 - Angel Fundraising Phase</p>
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
