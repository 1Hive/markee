'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { ChevronDown, Zap, DollarSign, TrendingUp, Clock, Globe, Users, Sparkles, Check } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-midnight-navy">
      <Header activePage="how-it-works" />

      {/* Pricing Strategies - Visual Cards */}
      <PricingStrategies />

      {/* Fee Receiver Section */}
      <FeeReceiverSection />

      {/* Collect Section */}
      <CollectSection />

      {/* Condensed FAQ */}
      <CondensedFAQ />

      <Footer />
    </div>
  )
}

// ============================================
// FEE RECEIVER SECTION
// ============================================
function FeeReceiverSection() {
  return (
    <section className="py-24 bg-midnight-navy border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-4">
          2. Choose an Address to Receive Funds
        </h2>
        <p className="text-xl text-lavender-gray text-center mb-16">
          Incoming funds from messages are split according to the Golden Ratio.
        </p>

        <div className="flex flex-col md:flex-row gap-6 max-w-5xl mx-auto">
          {/* Box 1: Markee Beneficiary - 62% width */}
          <div className="md:flex-[62]">
            <FeeReceiverCard
              percentage="62%"
              title="Your Beneficiary Address"
              description="Direct funding for your website, community, or digital organization."
              color="soft-pink"
              icon={<Users className="w-12 h-12" />}
            />
          </div>

          {/* Box 2: Cooperative Ownership - 38% width */}
          <div className="md:flex-[38]">
            <FeeReceiverCard
              percentage="38%"
              title="Markee Cooperative"
              description="Issues MARKEE in the RevNet."
              color="cool-sky-blue"
              icon={<Globe className="w-12 h-12" />}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function FeeReceiverCard({ percentage, icon, title, description, color }: { percentage: string, icon: React.ReactNode, title: string, description: string, color: string }) {
  const colorClasses = {
    'soft-pink': 'text-soft-pink border-soft-pink',
    'cool-sky-blue': 'text-cool-sky-blue border-cool-sky-blue',
  }

  return (
    <div className="relative bg-deep-space border-2 border-cool-slate/20 rounded-2xl p-8 hover:border-soft-pink/50 transition-all group h-full">
      <div className={`inline-block p-4 rounded-full bg-midnight-navy border-2 ${colorClasses[color as keyof typeof colorClasses]} mb-4 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div className="absolute top-4 right-4 text-5xl font-bold text-cool-slate/20 group-hover:text-soft-pink/20 transition-colors">
        {percentage}
      </div>
      <h3 className="text-2xl font-bold text-soft-white mb-3">{title}</h3>
      <p className="text-lavender-gray leading-relaxed">{description}</p>
    </div>
  )
}

// ============================================
// PRICING STRATEGIES
// ============================================
function PricingStrategies() {
  const [hoveredStrategy, setHoveredStrategy] = useState<string | null>(null)

  const strategies = [
    {
      id: 'fixed',
      name: 'Fixed Price',
      icon: <DollarSign className="w-8 h-8" />,
      color: 'soft-pink',
      description: 'Set price, paid each time message is changed',
      visual: 'Simple exchange',
      example: 'price to update',
      status: 'live'
    },
    {
      id: 'leaderboard',
      name: 'Leaderboard',
      icon: <TrendingUp className="w-8 h-8" />,
      color: 'cool-sky-blue',
      description: 'Buyer owns message, top funded message is featured',
      visual: 'Competitive bidding',
      example: '',
      status: 'live'
    },
    {
      id: 'stream',
      name: 'Stream-to-Own',
      icon: <Zap className="w-8 h-8" />,
      color: 'amethyst',
      description: 'Leaderboard strategy using Superfluid streams',
      visual: 'Continuous payment',
      example: 'Coming Soon.',
      status: 'coming-soon'
    },
    {
      id: 'dynamic',
      name: 'Dynamic',
      icon: <Clock className="w-8 h-8" />,
      color: 'galactic-purple',
      description: 'Automated pricing based on demand',
      visual: '10x spike then decay',
      example: 'Coming Soon.',
      status: 'coming-soon'
    }
  ]

  return (
    <section className="pt-32 pb-24 bg-deep-space border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-soft-white mb-4">
            1. Choose Your Pricing Strategy
          </h2>
          <p className="text-xl text-lavender-gray">
            Pricing strategies for Markee messages are interchangeable - choose what works best for your digital real estate.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              isHovered={hoveredStrategy === strategy.id}
              onHover={() => setHoveredStrategy(strategy.id)}
              onLeave={() => setHoveredStrategy(null)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function StrategyCard({ strategy, isHovered, onHover, onLeave }: any) {
  const colorClasses = {
    'soft-pink': 'border-soft-pink text-soft-pink',
    'cool-sky-blue': 'border-cool-sky-blue text-cool-sky-blue',
    'amethyst': 'border-amethyst text-amethyst',
    'galactic-purple': 'border-galactic-purple text-galactic-purple',
  }

  const isComingSoon = strategy.status !== 'live'

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`relative bg-midnight-navy border-2 rounded-2xl p-6 transition-all cursor-pointer ${
        isHovered ? `${colorClasses[strategy.color as keyof typeof colorClasses]} scale-105 shadow-2xl` : 'border-cool-slate/20 hover:border-cool-slate/40'
      } ${isComingSoon ? 'opacity-70' : ''}`}
    >
      {isComingSoon && (
        <div className="absolute top-4 right-4 bg-deep-space text-cool-slate text-xs font-bold px-3 py-1 rounded-full">
          Coming Soon
        </div>
      )}

      <div className={`inline-block p-3 rounded-xl bg-deep-space border-2 ${colorClasses[strategy.color as keyof typeof colorClasses]} mb-4 transition-transform ${isHovered ? 'scale-110' : ''}`}>
        {strategy.icon}
      </div>

      <h3 className="text-xl font-bold text-soft-white mb-2">{strategy.name}</h3>
      <p className="text-lavender-gray text-sm mb-4">{strategy.description}</p>

      {/* Visual Representation */}
      <div className="bg-deep-space rounded-lg p-4 mb-3 min-h-[80px] flex items-center justify-center">
        {strategy.id === 'fixed' && <FixedPriceVisual />}
        {strategy.id === 'leaderboard' && <LeaderboardVisual isHovered={isHovered} />}
        {strategy.id === 'stream' && <StreamVisual isHovered={isHovered} />}
        {strategy.id === 'dynamic' && <DynamicVisual isHovered={isHovered} />}
      </div>

      <div className="text-center text-cool-slate text-xs font-mono">
        {strategy.example}
      </div>
    </div>
  )
}

function FixedPriceVisual() {
  return (
    <div className="flex items-center gap-2 text-soft-white">
      <div className="bg-cool-sky-blue text-midnight-navy px-3 py-1 rounded-md text-sm font-bold">
        💰 0.1 ETH
      </div>
    </div>
  )
}

function LeaderboardVisual({ isHovered }: { isHovered: boolean }) {
  return (
    <div className="space-y-1 w-full">
      {[
        { name: 'Satoshi', amount: '0.5', isTop: true },
        { name: 'Vitalik', amount: '0.3', isTop: false },
        { name: 'Jango', amount: '0.2', isTop: false },
      ].map((entry, i) => (
        <div
          key={entry.name}
          className={`flex items-center justify-between px-2 py-1 rounded transition-all ${
            entry.isTop && isHovered ? 'bg-soft-pink/20 scale-105' : 'bg-deep-space/50'
          }`}
        >
          <span className="text-xs text-lavender-gray">{entry.name}</span>
          <span className="text-xs font-mono text-cool-sky-blue">{entry.amount} ETH</span>
        </div>
      ))}
    </div>
  )
}

function StreamVisual({ isHovered }: { isHovered: boolean }) {
  return (
    <div className="space-y-1 w-full">
      {[
        { name: 'Neil', amount: '0.15', isTop: true },
        { name: 'Buzz', amount: '0.06', isTop: false },
        { name: 'Eugene', amount: '0.05', isTop: false },
      ].map((entry, i) => (
        <div
          key={entry.name}
          className={`flex items-center justify-between px-2 py-1 rounded transition-all ${
            entry.isTop && isHovered ? 'bg-soft-pink/20 scale-105' : 'bg-deep-space/50'
          }`}
        >
          <span className="text-xs text-lavender-gray">{entry.name}</span>
          <span className="text-xs font-mono text-cool-sky-blue">{entry.amount} ETH/mo.</span>
        </div>
      ))}
    </div>
  )
}

function DynamicVisual({ isHovered }: { isHovered: boolean }) {
  return (
    <svg viewBox="0 0 100 40" className="w-full h-12">
      <path
        d="M 5 35 L 20 5 L 35 13 L 50 17 L 65 19 L 80 20 L 95 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`text-amethyst transition-all ${isHovered ? 'stroke-soft-pink' : ''}`}
      />
    </svg>
  )
}

// ============================================
// COLLECT SECTION
// ============================================
function CollectSection() {
  return (
    <section className="py-24 bg-deep-space border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-4">
          3. Earn Revenue
        </h2>
        <p className="text-xl text-lavender-gray text-center mb-16">
          From passionate users with something to say, and from a global network of message buyers.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* CTA 1 */}
          <CollectCTACard
            title="Cooperative Ownership"
            subtitle="See how the network's ownership structure works"
            buttonText="Learn More"
            buttonLink="https://www.markee.xyz/owners"
            color="amethyst"
          />

          {/* CTA 2 */}
          <CollectCTACard
            title="Our Ecosystem"
            subtitle="See the platforms adding Markee to their sites"
            buttonText="View Ecosystem"
            buttonLink="https://www.markee.xyz/ecosystem"
            color="cool-sky-blue"
          />

          {/* CTA 3 */}
          <CollectCTACard
            title="Join Markee"
            subtitle="Buy a Message to issue MARKEE tokens from the RevNet"
            buttonText="Buy a Message"
            buttonLink="https://www.markee.xyz/ecosystem/markee-cooperative"
            color="soft-pink"
          />
        </div>
      </div>
    </section>
  )
}

function CollectCTACard({ title, subtitle, buttonText, buttonLink, color }: any) {
  const colorClasses = {
    'soft-pink': 'bg-soft-pink text-midnight-navy hover:bg-opacity-90',
    'cool-sky-blue': 'bg-cool-sky-blue text-midnight-navy hover:bg-opacity-90',
    'amethyst': 'bg-amethyst text-midnight-navy hover:bg-opacity-90',
  }

  return (
    <div className="bg-midnight-navy border-2 border-cool-slate/20 rounded-2xl p-8 hover:border-soft-pink/50 transition-all">
      <h3 className="text-2xl font-bold text-soft-white mb-3 text-center">{title}</h3>
      <p className="text-lavender-gray text-sm mb-6 text-center">{subtitle}</p>
      <Link
        href={buttonLink}
        className={`block text-center px-6 py-3 rounded-xl font-bold transition-all ${colorClasses[color as keyof typeof colorClasses]}`}
      >
        {buttonText}
      </Link>
    </div>
  )
}

// ============================================
// CONDENSED FAQ
// ============================================
function CondensedFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const faqs = [
    {
      question: "What is the Markee Cooperative?",
      answer: (
        <div>
          <p className="mb-3">The Markee Cooperative is the collective of MARKEE token holders who collectively own the Markee Network — including its smart contracts, domains, brand assets, and treasury. Holding any amount of MARKEE makes you an Owner.</p>
          <p className="mb-3">Governance decisions are made onchain through the Gardens community using conviction voting. The foundational ownership rights and tokenomics are immutable — no one, including the Council Safe, can alter them.</p>
          <a href="https://app.gardens.fund/gardens/8453/0xee3027f1e021b09d629922d40436c5dea3c6cb38/0xce6b968c8bd130ca08f1fcc97b509a824380d867" target="_blank" rel="noopener noreferrer" className="text-soft-pink hover:underline font-semibold">
            Participate in governance on Gardens →
          </a>
        </div>
      )
    },
    {
      question: "How do I become an owner?",
      answer: (
        <div>
          <p className="mb-3">Buy a message on any Markee Network platform and you'll receive MARKEE tokens from the RevNet. Holding any amount of MARKEE makes you an Owner of the Markee Network including the ability to redeem from the Revnet's treasury.</p>
          <p className="mb-3">MARKEE tokens are freely transferable and can also be allocated from the Community Reserve to organizations and participants who advance the Cooperative's mission.</p>
          <Link href="/owners" className="text-soft-pink hover:underline font-semibold">
            Learn about ownership →
          </Link>
        </div>
      )
    },
    {
      question: "What do MARKEE tokens do?",
      answer: (
        <div className="space-y-3">
          <p>MARKEE is the governance and ownership token of the Markee Network. Holding MARKEE means you are a co-owner of the network and its assets.</p>
          <p><strong className="text-soft-white">Governance:</strong> Vote on proposals in the Gardens community using conviction voting to direct the future of the network.</p>
          <p><strong className="text-soft-white">Ownership:</strong> MARKEE holders collectively own the Markee Network, including its smart contracts, domains, brand, and treasury.</p>
          <p><strong className="text-soft-white">Accrue Revenue:</strong> Pre-scheduled price increases are locked in the Revnet's smart contract, and permissionlessly distribute revenue to MARKEE holders over time</p>
          <a href="https://www.revnet.app/v5:base:119/terms" target="_blank" rel="noopener noreferrer" className="text-soft-pink hover:underline font-semibold">
            View token terms on Revnets →
          </a>
        </div>
      )
    },
    {
      question: "What are RevNets?",
      answer: (
        <div>
          <p className="mb-3">Revnets are 100% automated tokenized revenue systems built on Juicebox smart contracts. They apply crowdfunding concepts to revenue-generating digital cooperatives with preset terms for how revenue is shared.</p>
          <p className="mb-3">The Markee RevNet's token issuance rules are immutable. The only configurable parameter is where the 38% community reserve is distributed</p>
          <a href="https://revnet.eth.sucks/" target="_blank" rel="noopener noreferrer" className="text-soft-pink hover:underline font-semibold">
            See project on Revnets →
          </a>
        </div>
      )
    },
    {
      question: "When can I integrate Markee?",
      answer: (
        <div className="space-y-2">
          <p>Markee is now live, with our first integrations under construction. If you run a website, community platform, or digital organization, reach out to and sign up to join the waitlist.</p>
          <p className="mt-3"><Link href="/ecosystem" className="text-soft-pink hover:underline font-semibold">Explore our ecosystem</Link> to see existing integrations, or contact us to get started.</p>
        </div>
      )
    },
    {
      question: "Is Markee open source?",
      answer: (
        <div>
          <p className="mb-3">Yes. The Markee Network and all of its assets are open source under the GNU General Public License v3.0 (GPL-3.0). Anyone may fork, modify, share, or redistribute Markee, provided derivative works carry the same freedoms.</p>
          <p className="mb-3">This is a core value of the Cooperative; we believe in an open internet where communities own the infrastructure they rely on.</p>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-soft-pink hover:underline font-semibold">
            View source on GitHub →
          </a>
        </div>
      )
    },
  ]

  return (
    <section className="py-24 bg-midnight-navy">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-12">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-deep-space rounded-xl border-2 border-cool-slate/20 overflow-hidden hover:border-soft-pink/30 transition-all">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 flex justify-between items-center hover:bg-cosmic-indigo/30 transition-colors"
              >
                <span className="font-bold text-soft-white text-left text-lg">{faq.question}</span>
                <ChevronDown
                  size={24}
                  className={`text-soft-pink transition-transform flex-shrink-0 ml-4 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 py-6 bg-midnight-navy border-t border-cool-slate/20 text-lavender-gray">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
