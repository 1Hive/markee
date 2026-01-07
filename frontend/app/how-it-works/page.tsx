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

      {/* How It Works - 3 Visual Steps */}
      <ThreeStepFlow />

      {/* Two Integration Paths */}
      <IntegrationPaths />

      {/* Network Effect Visualization */}
      <NetworkEffect />

      {/* Money Flow - Unified Diagram */}
      <UnifiedMoneyFlow />

      {/* Visual Timeline */}
      <VisualTimeline />

      {/* Condensed FAQ */}
      <CondensedFAQ />

      {/* Multi-CTA Footer */}
      <MultiCTAFooter />

      <Footer />
    </div>
  )
}

// ============================================
// THREE STEP FLOW
// ============================================
function ThreeStepFlow() {
  return (
    <section className="py-24 bg-midnight-navy border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-16">
          2. How It Works
        </h2>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connection Lines */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-soft-pink via-cool-sky-blue to-amethyst -translate-y-1/2 z-0" />

          {/* Step 1 */}
          <StepCard
            number="1"
            icon={<Sparkles className="w-12 h-12" />}
            title="Create Markee"
            description="Set up your message board with your chosen pricing strategy"
            color="soft-pink"
          />

          {/* Step 2 */}
          <StepCard
            number="2"
            icon={<DollarSign className="w-12 h-12" />}
            title="People Pay to Edit"
            description="Anyone can update the message by paying through your chosen strategy"
            color="cool-sky-blue"
          />

          {/* Step 3 */}
          <StepCard
            number="3"
            icon={<Globe className="w-12 h-12" />}
            title="Revenue → Tokens"
            description="Payments flow to RevNet, minting MARKEE tokens for buyers and the cooperative"
            color="amethyst"
          />
        </div>
      </div>
    </section>
  )
}

function StepCard({ number, icon, title, description, color }: { number: string, icon: React.ReactNode, title: string, description: string, color: string }) {
  const colorClasses = {
    'soft-pink': 'text-soft-pink border-soft-pink',
    'cool-sky-blue': 'text-cool-sky-blue border-cool-sky-blue',
    'amethyst': 'text-amethyst border-amethyst',
  }

  return (
    <div className="relative z-10 bg-deep-space border-2 border-cool-slate/20 rounded-2xl p-8 hover:border-soft-pink/50 transition-all group">
      <div className={`inline-block p-4 rounded-full bg-midnight-navy border-2 ${colorClasses[color as keyof typeof colorClasses]} mb-4 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div className="absolute top-4 right-4 text-5xl font-bold text-cool-slate/20 group-hover:text-soft-pink/20 transition-colors">
        {number}
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
      description: 'Paid each time the message is changed',
      visual: 'Simple exchange',
      example: '0.01 ETH per update',
      status: 'live'
    },
    {
      id: 'leaderboard',
      name: 'Leaderboard',
      icon: <TrendingUp className="w-8 h-8" />,
      color: 'cool-sky-blue',
      description: 'Own your message, highest total paid wins',
      visual: 'Competitive bidding',
      example: 'Add to your total',
      status: 'live'
    },
    {
      id: 'stream',
      name: 'Stream-to-Own',
      icon: <Zap className="w-8 h-8" />,
      color: 'amethyst',
      description: 'Leaderboard strategy using Superfluid streams',
      visual: 'Continuous payment',
      example: '0.001 ETH/second',
      status: 'q1-2026'
    },
    {
      id: 'dynamic',
      name: 'Dynamic',
      icon: <Clock className="w-8 h-8" />,
      color: 'galactic-purple',
      description: 'Algorithmic pricing based on demand',
      visual: '10x spike then decay',
      example: 'Starts at 0.01 ETH',
      status: 'q1-2026'
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
            Pricing strategies for Markee messages are interchangeable - choose what works best for your digital real estate
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
          Q1 2026
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
      <div className="bg-soft-pink text-midnight-navy px-3 py-1 rounded-md text-sm font-bold">
        💬 Message
      </div>
      <div className="text-lavender-gray">←</div>
      <div className="bg-cool-sky-blue text-midnight-navy px-3 py-1 rounded-md text-sm font-bold">
        💰 Pay
      </div>
    </div>
  )
}

function LeaderboardVisual({ isHovered }: { isHovered: boolean }) {
  return (
    <div className="space-y-1 w-full">
      {[
        { name: 'Alice', amount: '0.5', isTop: true },
        { name: 'Bob', amount: '0.3', isTop: false },
        { name: 'Carol', amount: '0.2', isTop: false },
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
    <div className="flex items-center gap-2">
      <div className="text-2xl animate-pulse">💧</div>
      <div className={`flex-1 h-2 rounded-full bg-gradient-to-r from-soft-pink to-cool-sky-blue transition-all ${isHovered ? 'animate-pulse' : ''}`} />
      <div className="text-2xl">💬</div>
    </div>
  )
}

function DynamicVisual({ isHovered }: { isHovered: boolean }) {
  return (
    <svg viewBox="0 0 100 40" className="w-full h-12">
      <path
        d="M 5 35 L 20 5 L 35 30 L 50 25 L 65 32 L 80 33 L 95 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`text-amethyst transition-all ${isHovered ? 'stroke-soft-pink' : ''}`}
      />
      <circle cx="20" cy="5" r="3" className="fill-soft-pink" />
    </svg>
  )
}

// ============================================
// INTEGRATION PATHS
// ============================================
function IntegrationPaths() {
  return (
    <section className="py-24 bg-midnight-navy border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-16">
          Two Ways to Integrate
        </h2>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Add to Your Site */}
          <IntegrationPathCard
            title="Add to Your Site"
            subtitle="Coming Q1 2026"
            icon="🌐"
            steps={[
              { icon: '📋', text: 'Copy embed code' },
              { icon: '⚙️', text: 'Choose pricing strategy' },
              { icon: '💰', text: 'Set fee receiver' },
              { icon: '🚀', text: 'Start earning' },
            ]}
            color="soft-pink"
          />

          {/* Integrate Your Platform */}
          <IntegrationPathCard
            title="Integrate Your Platform"
            subtitle="Coming Q2 2026"
            icon="🏢"
            steps={[
              { icon: '🤝', text: 'Partner with Markee' },
              { icon: '👥', text: 'Users create Markees' },
              { icon: '🎯', text: 'They pick strategy & receiver' },
              { icon: '📈', text: 'Ecosystem grows' },
            ]}
            color="cool-sky-blue"
            ctaLink="/ecosystem"
            ctaText="View Ecosystem"
          />
        </div>
      </div>
    </section>
  )
}

function IntegrationPathCard({ title, subtitle, icon, steps, color, ctaLink, ctaText }: any) {
  const colorClasses = {
    'soft-pink': 'border-soft-pink bg-soft-pink/5',
    'cool-sky-blue': 'border-cool-sky-blue bg-cool-sky-blue/5',
  }

  return (
    <div className={`border-2 rounded-2xl p-8 ${colorClasses[color as keyof typeof colorClasses]} transition-all hover:scale-105`}>
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">{icon}</div>
        <h3 className="text-2xl font-bold text-soft-white mb-2">{title}</h3>
        <p className="text-cool-slate text-sm">{subtitle}</p>
      </div>

      <div className="space-y-4 mb-8">
        {steps.map((step: any, index: number) => (
          <div key={index} className="flex items-center gap-4 bg-deep-space rounded-lg p-4">
            <div className="text-2xl flex-shrink-0">{step.icon}</div>
            <div className="text-lavender-gray">{step.text}</div>
          </div>
        ))}
      </div>

      {ctaLink && (
        <Link
          href={ctaLink}
          className="block text-center bg-midnight-navy border-2 border-cool-sky-blue text-cool-sky-blue px-6 py-3 rounded-lg font-bold hover:bg-cool-sky-blue hover:text-midnight-navy transition-all"
        >
          {ctaText}
        </Link>
      )}
    </div>
  )
}

// ============================================
// NETWORK EFFECT
// ============================================
function NetworkEffect() {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => setIsAnimating(false), 2000)
    }, 4000)

    return () => clearInterval(interval)
  }, [])

  return (
    <section className="py-24 bg-deep-space border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-soft-white mb-4">
            The Network Effect
          </h2>
          <p className="text-xl text-lavender-gray max-w-3xl mx-auto">
            Markee creators can opt into the network. Message buyers pay once to update all connected Markees at once.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Visualization */}
          <div className="relative h-96 bg-midnight-navy rounded-2xl border-2 border-cool-slate/20 p-8 overflow-hidden">
            <NetworkVisualization isAnimating={isAnimating} />
          </div>

          {/* Benefits */}
          <div className="space-y-6">
            <BenefitCard
              icon={<Sparkles className="w-6 h-6" />}
              title="For Markee Creators"
              description="Earn from network-wide message updates in addition to your own Markee revenue"
              color="soft-pink"
            />
            <BenefitCard
              icon={<Globe className="w-6 h-6" />}
              title="For Message Buyers"
              description="Pay once, reach everywhere. Update your message across all connected Markees simultaneously"
              color="cool-sky-blue"
            />
            <BenefitCard
              icon={<TrendingUp className="w-6 h-6" />}
              title="For the Ecosystem"
              description="More Markees = more value for everyone. Network effects benefit all participants"
              color="amethyst"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function NetworkVisualization({ isAnimating }: { isAnimating: boolean }) {
  const nodes = [
    { x: 50, y: 20, id: 1 },
    { x: 20, y: 40, id: 2 },
    { x: 80, y: 40, id: 3 },
    { x: 35, y: 65, id: 4 },
    { x: 65, y: 65, id: 5 },
    { x: 50, y: 85, id: 6 },
  ]

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Connection Lines */}
      {nodes.map((node, i) =>
        nodes.slice(i + 1).map((target, j) => (
          <line
            key={`${i}-${j}`}
            x1={node.x}
            y1={node.y}
            x2={target.x}
            y2={target.y}
            stroke="currentColor"
            strokeWidth="0.5"
            className={`text-cool-slate transition-all ${isAnimating ? 'text-soft-pink animate-pulse' : ''}`}
          />
        ))
      )}

      {/* Nodes */}
      {nodes.map((node) => (
        <g key={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            r="4"
            className={`transition-all ${isAnimating ? 'fill-soft-pink animate-pulse' : 'fill-cool-sky-blue'}`}
          />
          <circle
            cx={node.x}
            cy={node.y}
            r={isAnimating ? '8' : '0'}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-soft-pink opacity-50 transition-all"
          />
        </g>
      ))}

      {/* Ripple Effect from center */}
      {isAnimating && (
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-soft-pink opacity-0 animate-ping"
        />
      )}
    </svg>
  )
}

function BenefitCard({ icon, title, description, color }: any) {
  const colorClasses = {
    'soft-pink': 'border-soft-pink text-soft-pink',
    'cool-sky-blue': 'border-cool-sky-blue text-cool-sky-blue',
    'amethyst': 'border-amethyst text-amethyst',
  }

  return (
    <div className="bg-midnight-navy border-2 border-cool-slate/20 rounded-xl p-6 hover:border-soft-pink/50 transition-all">
      <div className={`inline-block p-2 rounded-lg border-2 ${colorClasses[color as keyof typeof colorClasses]} mb-3`}>
        {icon}
      </div>
      <h4 className="text-lg font-bold text-soft-white mb-2">{title}</h4>
      <p className="text-lavender-gray text-sm">{description}</p>
    </div>
  )
}

// ============================================
// UNIFIED MONEY FLOW
// ============================================
function UnifiedMoneyFlow() {
  const [activeFlow, setActiveFlow] = useState<'leaderboard' | 'website' | 'platform'>('leaderboard')

  return (
    <section className="py-24 bg-midnight-navy border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-8">
          Where Money Flows
        </h2>
        <p className="text-center text-lavender-gray mb-12">
          All revenue flows through the <Link href="/owners" className="text-soft-pink hover:underline font-semibold">RevNet</Link>, minting MARKEE tokens
        </p>

        {/* Flow Type Selector */}
        <div className="flex justify-center gap-4 mb-12 flex-wrap">
          <FlowButton
            active={activeFlow === 'leaderboard'}
            onClick={() => setActiveFlow('leaderboard')}
            label="Leaderboard"
            status="Live Now"
          />
          <FlowButton
            active={activeFlow === 'website'}
            onClick={() => setActiveFlow('website')}
            label="Website Plugin"
            status="Q1 2026"
          />
          <FlowButton
            active={activeFlow === 'platform'}
            onClick={() => setActiveFlow('platform')}
            label="Platform Integration"
            status="Q2 2026"
          />
        </div>

        {/* Flow Diagram */}
        <div className="bg-deep-space rounded-2xl p-8 border-2 border-cool-slate/20">
          {activeFlow === 'leaderboard' && <LeaderboardFlow />}
          {activeFlow === 'website' && <WebsiteFlow />}
          {activeFlow === 'platform' && <PlatformFlow />}
        </div>

        {/* Legend */}
        <div className="mt-8 flex justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-soft-pink" />
            <span className="text-lavender-gray">Payment Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cool-sky-blue" />
            <span className="text-lavender-gray">Token Flow</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function FlowButton({ active, onClick, label, status }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-lg font-medium transition-all ${
        active
          ? 'bg-soft-pink text-midnight-navy scale-105'
          : 'bg-deep-space text-lavender-gray hover:bg-cosmic-indigo border border-cool-slate/20'
      }`}
    >
      <div>{label}</div>
      <div className="text-xs opacity-70">{status}</div>
    </button>
  )
}

function LeaderboardFlow() {
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <FlowNode label="Buyer pays ETH" amount="0.1 ETH" color="soft-pink" />
      <FlowArrow label="100%" />
      <FlowNode label="RevNet" icon="🌐" color="galactic-purple" />
      <div className="flex gap-12">
        <div className="flex flex-col items-center gap-4">
          <FlowArrow label="68%" direction="diagonal-left" />
          <FlowNode label="Buyer receives" amount="68 MARKEE" color="cool-sky-blue" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <FlowArrow label="32%" direction="diagonal-right" />
          <FlowNode label="Cooperative" amount="32 MARKEE" color="amethyst" />
        </div>
      </div>
    </div>
  )
}

function WebsiteFlow() {
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <FlowNode label="Buyer pays" amount="0.1 ETH" color="soft-pink" />
      <div className="flex gap-16">
        <div className="flex flex-col items-center gap-4">
          <FlowArrow label="68%" direction="diagonal-left" />
          <FlowNode label="Website Owner" amount="0.068 ETH" color="peach-orb" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <FlowArrow label="32%" direction="diagonal-right" />
          <FlowNode label="RevNet" icon="🌐" color="galactic-purple" />
          <div className="flex gap-8 mt-4">
            <div className="flex flex-col items-center gap-2">
              <FlowArrow label="68%" direction="down" size="sm" />
              <FlowNode label="Buyer" amount="22 MARKEE" color="cool-sky-blue" size="sm" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <FlowArrow label="32%" direction="down" size="sm" />
              <FlowNode label="Coop" amount="10 MARKEE" color="amethyst" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlatformFlow() {
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <FlowNode label="Buyer pays" amount="0.1 ETH" color="soft-pink" />
      <div className="flex gap-16">
        <div className="flex flex-col items-center gap-4">
          <FlowArrow label="68%" direction="diagonal-left" />
          <FlowNode label="Community" amount="0.068 ETH" color="icy-blue" />
        </div>
        <div className="flex flex-col items-center gap-4">
          <FlowArrow label="32%" direction="diagonal-right" />
          <FlowNode label="RevNet" icon="🌐" color="galactic-purple" />
          <div className="flex gap-8 mt-4">
            <div className="flex flex-col items-center gap-2">
              <FlowArrow label="68%" direction="down" size="sm" />
              <FlowNode label="Platform" amount="22 MARKEE" color="lavender-accent" size="sm" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <FlowArrow label="32%" direction="down" size="sm" />
              <div className="flex flex-col items-center gap-2">
                <FlowNode label="Coop" amount="10 MARKEE" color="amethyst" size="sm" />
                <div className="text-xs text-cool-slate">32% buyer, 68% holders</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlowNode({ label, amount, icon, color, size = 'default' }: any) {
  const sizeClasses = size === 'sm' ? 'px-4 py-2 text-sm' : 'px-6 py-4'
  return (
    <div className={`bg-${color} text-midnight-navy rounded-xl ${sizeClasses} font-bold text-center min-w-[140px] shadow-lg`}>
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <div>{label}</div>
      {amount && <div className="text-xs opacity-80 mt-1">{amount}</div>}
    </div>
  )
}

function FlowArrow({ label, direction = 'down', size = 'default' }: any) {
  const arrowSize = size === 'sm' ? 'text-xl' : 'text-3xl'
  const arrows = {
    down: '↓',
    'diagonal-left': '↙',
    'diagonal-right': '↘',
  }

  return (
    <div className="flex flex-col items-center">
      <div className={`${arrowSize} text-soft-pink`}>{arrows[direction as keyof typeof arrows]}</div>
      {label && <div className="text-xs text-cool-slate font-mono">{label}</div>}
    </div>
  )
}

// ============================================
// VISUAL TIMELINE
// ============================================
function VisualTimeline() {
  const phases = [
    {
      phase: 'Phase 0',
      title: 'Under Construction',
      status: 'YOU ARE HERE',
      date: 'Now',
      icon: '🏗️',
      color: 'soft-pink',
      items: [
        'RevNet opens at 50,000 tokens/ETH',
        'Leaderboard live on multiple chains',
        'Platform integration waitlist open',
      ],
    },
    {
      phase: 'Q1 2026',
      title: 'First Integrations',
      status: 'LAUNCHING',
      date: 'Jan-Mar 2026',
      icon: '🚀',
      color: 'cool-sky-blue',
      items: [
        'Gardens platform integration',
        'Website plugin released',
        'Cooperative governance begins',
      ],
    },
    {
      phase: 'Q2 2026',
      title: 'Ecosystem Expansion',
      status: 'SCALING',
      date: 'Apr-Jun 2026',
      icon: '📈',
      color: 'amethyst',
      items: [
        'Multiple platform integrations',
        'Network effects activate',
        'Revenue scales across ecosystem',
      ],
    },
    {
      phase: 'Future',
      title: 'Global Network',
      status: 'VISION',
      date: '2026+',
      icon: '🌍',
      color: 'galactic-purple',
      items: [
        'Worldwide adoption',
        'Returns flow to token holders',
        'Open-source digital marketing standard',
      ],
    },
  ]

  return (
    <section className="py-24 bg-deep-space border-b border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-16">
          The Roadmap
        </h2>

        {/* Timeline */}
        <div className="relative">
          {/* Connection Line */}
          <div className="absolute top-24 left-0 right-0 h-1 bg-gradient-to-r from-soft-pink via-cool-sky-blue via-amethyst to-galactic-purple hidden lg:block" />

          {/* Phases */}
          <div className="grid lg:grid-cols-4 gap-8">
            {phases.map((phase, index) => (
              <TimelinePhase key={index} phase={phase} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function TimelinePhase({ phase, index }: any) {
  const colorClasses = {
    'soft-pink': 'border-soft-pink bg-soft-pink/10 text-soft-pink',
    'cool-sky-blue': 'border-cool-sky-blue bg-cool-sky-blue/10 text-cool-sky-blue',
    'amethyst': 'border-amethyst bg-amethyst/10 text-amethyst',
    'galactic-purple': 'border-galactic-purple bg-galactic-purple/10 text-galactic-purple',
  }

  const isActive = index === 0

  return (
    <div className="relative">
      {/* Timeline Dot */}
      <div className="hidden lg:flex justify-center mb-8">
        <div className={`w-12 h-12 rounded-full border-4 ${colorClasses[phase.color as keyof typeof colorClasses]} flex items-center justify-center text-2xl ${isActive ? 'animate-pulse scale-125' : ''}`}>
          {phase.icon}
        </div>
      </div>

      {/* Card */}
      <div className={`bg-midnight-navy border-2 rounded-2xl p-6 ${isActive ? colorClasses[phase.color as keyof typeof colorClasses] + ' scale-105' : 'border-cool-slate/20'} transition-all hover:scale-105`}>
        {isActive && (
          <div className="bg-soft-pink text-midnight-navy text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">
            {phase.status}
          </div>
        )}

        <div className="text-cool-slate text-sm font-mono mb-1">{phase.date}</div>
        <h3 className="text-xl font-bold text-soft-white mb-2">{phase.phase}</h3>
        <h4 className="text-lg text-lavender-gray mb-4">{phase.title}</h4>

        <ul className="space-y-2">
          {phase.items.map((item: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-lavender-gray">
              <Check className="w-4 h-4 text-soft-pink flex-shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
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
      question: "What is a RevNet?",
      answer: (
        <div>
          <p className="mb-3">RevNets are 100% automated tokenized revenue systems built on Juicebox smart contracts. They apply crowdfunding concepts to revenue-generating digital cooperatives with preset terms for how revenue is shared.</p>
          <a href="https://revnet.eth.sucks/" target="_blank" rel="noopener noreferrer" className="text-soft-pink hover:underline font-semibold">
            Learn more at revnet.eth.sucks →
          </a>
        </div>
      )
    },
    {
      question: "How do I become an owner?",
      answer: (
        <div>
          <p className="mb-3">During Phase 0, you can become an owner by investing through the leaderboard. Pay to update the message and receive MARKEE tokens based on the current RevNet price (starting at 50,000 tokens/ETH).</p>
          <Link href="/owners" className="text-soft-pink hover:underline font-semibold">
            Learn about ownership →
          </Link>
        </div>
      )
    },
    {
      question: "What pricing strategy should I use?",
      answer: (
        <div className="space-y-3">
          <p><strong className="text-soft-white">Fixed Price:</strong> Best for predictable, simple transactions</p>
          <p><strong className="text-soft-white">Leaderboard:</strong> Best for fundraising and early believers</p>
          <p><strong className="text-soft-white">Stream-to-Own:</strong> Best for continuous engagement (Q1 2026)</p>
          <p><strong className="text-soft-white">Dynamic:</strong> Best for viral moments and algorithmic pricing (Q1 2026)</p>
        </div>
      )
    },
    {
      question: "When can I integrate Markee?",
      answer: (
        <div className="space-y-2">
          <p><strong className="text-soft-white">Website Plugin:</strong> Q1 2026 - Add Markees to any website</p>
          <p><strong className="text-soft-white">Platform Integration:</strong> Q2 2026 - Partner with us to offer Markees to your users</p>
          <p className="mt-3">Join the waitlist or <Link href="/ecosystem" className="text-soft-pink hover:underline font-semibold">explore our ecosystem</Link> to learn more.</p>
        </div>
      )
    },
  ]

  return (
    <section className="py-24 bg-midnight-navy">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-soft-white text-center mb-12">
          Quick Answers
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

        <div className="mt-12 text-center">
          <p className="text-lavender-gray mb-4">Have more questions?</p>
          <button className="text-soft-pink hover:underline font-semibold">
            View Full FAQ →
          </button>
        </div>
      </div>
    </section>
  )
}

// ============================================
// MULTI-CTA FOOTER
// ============================================
function MultiCTAFooter() {
  return (
    <section className="bg-gradient-to-b from-deep-space to-cosmic-indigo py-20 border-t border-cool-slate/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-soft-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-lavender-gray">
            Join the open-source digital marketing revolution
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Primary CTA */}
          <CTACard
            title="Buy MARKEE"
            description="Invest in the cooperative during Phase 0"
            buttonText="Buy on RevNet"
            buttonLink="/"
            color="soft-pink"
            isPrimary
          />

          {/* Secondary CTA */}
          <CTACard
            title="Join Waitlist"
            description="Get early access to platform integrations"
            buttonText="Sign Up"
            buttonLink="/ecosystem"
            color="cool-sky-blue"
          />

          {/* Tertiary CTA */}
          <CTACard
            title="Learn More"
            description="Explore the ecosystem and partnerships"
            buttonText="View Ecosystem"
            buttonLink="/ecosystem"
            color="amethyst"
          />
        </div>
      </div>
    </section>
  )
}

function CTACard({ title, description, buttonText, buttonLink, color, isPrimary }: any) {
  const colorClasses = {
    'soft-pink': isPrimary ? 'bg-soft-pink text-midnight-navy' : 'bg-midnight-navy text-soft-pink border-soft-pink',
    'cool-sky-blue': 'bg-midnight-navy text-cool-sky-blue border-cool-sky-blue',
    'amethyst': 'bg-midnight-navy text-amethyst border-amethyst',
  }

  return (
    <div className={`bg-midnight-navy border-2 border-cool-slate/20 rounded-2xl p-8 hover:border-${color} transition-all ${isPrimary ? 'md:scale-105' : ''}`}>
      <h3 className="text-2xl font-bold text-soft-white mb-3">{title}</h3>
      <p className="text-lavender-gray mb-6">{description}</p>
      <Link
        href={buttonLink}
        className={`block text-center px-6 py-3 rounded-xl font-bold transition-all ${colorClasses[color as keyof typeof colorClasses]} ${isPrimary ? '' : 'border-2'} hover:scale-105`}
      >
        {buttonText}
      </Link>
    </div>
  )
}
