'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { ConnectButton } from '@/components/wallet/ConnectButton'

// Phase configuration
const PHASES = [
  { 
    phase: 0, 
    rate: 50000, 
    endDate: new Date('2025-12-21T00:00:00Z'),
    label: 'Phase 0',
    color: 'bg-[#F897FE]'
  },
  { 
    phase: 1, 
    rate: 30000, 
    endDate: new Date('2026-03-21T00:00:00Z'),
    label: 'Phase 1',
    color: 'bg-[#935AF0]'
  },
  { 
    phase: 2, 
    rate: 24000, 
    endDate: new Date('2026-06-21T00:00:00Z'),
    label: 'Phase 2',
    color: 'bg-[#7B6AF4]'
  },
  { 
    phase: 3, 
    rate: 20000, 
    endDate: new Date('2026-09-21T00:00:00Z'),
    label: 'Phase 3',
    color: 'bg-[#6A4AE3]'
  },
  { 
    phase: 4, 
    rate: 17000, 
    endDate: new Date('2026-12-21T00:00:00Z'),
    label: 'Phase 4',
    color: 'bg-[#4B3ACC]'
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

export default function Owners() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
                <Link href="/ecosystem" className="text-[#B8B6D9] hover:text-[#F897FE]">Ecosystem</Link>
                <Link href="/owners" className="text-[#F897FE] font-medium">Owners</Link>
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
                  className="text-[#B8B6D9] hover:text-[#F897FE] py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Ecosystem
                </Link>
                <Link 
                  href="/owners" 
                  className="text-[#F897FE] font-medium py-2"
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
          <h1 className="text-4xl font-bold text-[#EDEEFF] mb-6">Ownership Structure</h1>
          <p className="text-xl text-[#B8B6D9]">
            Markee is owned by a Digital Cooperative powered by RevNets, permissionlessly shifting ownership from the founding team to the community as revenue is generated.
          </p>
        </div>
      </section>

      {/* Countdown and Phase Visualization */}
      <section className="bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CountdownTimer />
          <PhaseVisualization />
        </div>
      </section>

      {/* Ownership Model */}
      <section className="py-16 bg-[#060A2A] border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8 text-center">Two-Entity Structure</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* LLC */}
            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-8 border-l-4 border-[#7C9CFF]">
              <h3 className="text-2xl font-bold text-[#EDEEFF] mb-4">Markee LLC</h3>
              <p className="text-sm text-[#8A8FBF] mb-4">Wyoming Series LLC</p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-[#EDEEFF] mb-2">Ownership</h4>
                  <p className="text-[#B8B6D9]">Owned by the founders</p>
                </div>
                
                <div>
                  <h4 className="font-semibold text-[#EDEEFF] mb-2">Token Allocation</h4>
                  <p className="text-[#B8B6D9]">One-time allocation of 50M MARKEE tokens at launch</p>
                  <p className="text-sm text-[#8A8FBF] mt-1">No further RevNet allocations</p>
                </div>
                
                <div>
                  <h4 className="font-semibold text-[#EDEEFF] mb-2">Role</h4>
                  <ul className="list-disc pl-5 space-y-1 text-[#B8B6D9]">
                    <li>Operates the platform</li>
                    <li>Maintains infrastructure</li>
                    <li>Develops integrations</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Cooperative */}
            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-8 border-l-4 border-[#F897FE]">
              <h3 className="text-2xl font-bold text-[#EDEEFF] mb-4">Markee LCA</h3>
              <p className="text-sm text-[#8A8FBF] mb-4">Colorado Limited Cooperative Association</p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-[#EDEEFF] mb-2">Ownership</h4>
                  <p className="text-[#B8B6D9]">Owned by MARKEE token holders</p>
                </div>
                
                <div>
                  <h4 className="font-semibold text-[#EDEEFF] mb-2">Token Allocation</h4>
                  <p className="text-[#B8B6D9]">Receives 32% of all future RevNet tokens from revenue</p>
                  <p className="text-sm text-[#8A8FBF] mt-1">Ongoing allocation as revenue grows</p>
                </div>
                
                <div>
                  <h4 className="font-semibold text-[#EDEEFF] mb-2">Governance</h4>
                  <ul className="list-disc pl-5 space-y-1 text-[#B8B6D9]">
                    <li>Board of Directors elected by token holders</li>
                    <li>Managed via Gardens with onchain covenant</li>
                    <li>Controls distribution settings</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#F897FE]/10 rounded-lg p-6 max-w-3xl mx-auto border border-[#F897FE]/20">
            <h4 className="font-bold text-[#EDEEFF] mb-2">Progressive Ownership Shift</h4>
            <p className="text-[#B8B6D9]">
              As revenue grows and/or the LLC redeems tokens for operational expenses, ownership progressively shifts toward the cooperative and its token holders. This creates a path toward community ownership over time.
            </p>
          </div>
        </div>
      </section>

      {/* Reserve Rate Distribution */}
      <section className="py-16 bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8 text-center">Reserve Rate & Distribution</h2>
          
          <div className="bg-[#060A2A] rounded-lg shadow-md p-8 border border-[#8A8FBF]/20 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-bold text-[#EDEEFF] mb-4">From Every Payment</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#7C9CFF]/10 rounded border border-[#7C9CFF]/20">
                    <span className="font-semibold text-[#EDEEFF]">Buyer/Platform</span>
                    <span className="text-2xl font-bold text-[#7C9CFF]">68%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#F897FE]/10 rounded border border-[#F897FE]/20">
                    <span className="font-semibold text-[#EDEEFF]">Cooperative</span>
                    <span className="text-2xl font-bold text-[#F897FE]">32%</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-[#EDEEFF] mb-4">Cooperative's 32% Goes To</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-[#0A0F3D] rounded border border-[#8A8FBF]/20">
                    <div className="font-semibold text-[#EDEEFF] mb-1">Platform Partners</div>
                    <p className="text-sm text-[#8A8FBF]">Share based on integration terms</p>
                  </div>
                  <div className="p-3 bg-[#0A0F3D] rounded border border-[#8A8FBF]/20">
                    <div className="font-semibold text-[#EDEEFF] mb-1">Cooperative Members</div>
                    <p className="text-sm text-[#8A8FBF]">Token holders via patronage dividends</p>
                  </div>
                  <div className="p-3 bg-[#0A0F3D] rounded border border-[#8A8FBF]/20">
                    <div className="font-semibold text-[#EDEEFF] mb-1">Markee Builders</div>
                    <p className="text-sm text-[#8A8FBF]">Development and operations</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#7C9CFF]/10 rounded-lg p-6 max-w-3xl mx-auto border border-[#7C9CFF]/20">
            <h4 className="font-bold text-[#EDEEFF] mb-2">Governed by Token Holders</h4>
            <p className="text-[#B8B6D9]">
              The cooperative's Board of Directors (elected by MARKEE token holders) can adjust distribution settings through governance votes on Gardens. This ensures the community controls how cooperative reserves are allocated.
            </p>
          </div>
        </div>
      </section>

      {/* Charts Placeholder */}
      <section className="py-16 bg-[#060A2A] border-b border-[#8A8FBF]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#EDEEFF] mb-8 text-center">Ownership Dynamics</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Chart placeholder 1 */}
            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-8 border border-[#8A8FBF]/20">
              <h3 className="text-xl font-bold text-[#EDEEFF] mb-4">Price Ceiling vs Floor</h3>
              <div className="aspect-video bg-[#060A2A] rounded flex items-center justify-center border border-[#8A8FBF]/20">
                <div className="text-center text-[#8A8FBF]">
                  <div className="text-4xl mb-2">📊</div>
                  <p>Chart Coming Soon</p>
                  <p className="text-sm mt-2">Showing price ceiling divergence<br />from floor price over time</p>
                </div>
              </div>
            </div>

            {/* Chart placeholder 2 */}
            <div className="bg-[#0A0F3D] rounded-lg shadow-md p-8 border border-[#8A8FBF]/20">
              <h3 className="text-xl font-bold text-[#EDEEFF] mb-4">LLC vs Cooperative Ownership</h3>
              <div className="aspect-video bg-[#060A2A] rounded flex items-center justify-center border border-[#8A8FBF]/20">
                <div className="text-center text-[#8A8FBF]">
                  <div className="text-4xl mb-2">📈</div>
                  <p>Chart Coming Soon</p>
                  <p className="text-sm mt-2">Showing ownership shift<br />from LLC to Cooperative</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RevNet Terms Link */}
      <section className="py-12 bg-[#0A0F3D]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-2xl font-bold text-[#EDEEFF] mb-4">Full RevNet Terms</h3>
          <p className="text-[#B8B6D9] mb-6">
            View complete tokenomics, reserve rates, and governance parameters on-chain.
          </p>
          <a 
            href="https://app.revnet.eth.sucks/v5:op:52/terms" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
          >
            View on RevNets →
          </a>
        </div>
      </section>

      {/* Footer */}
      <Footer />
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
      <h2 className="text-2xl font-bold text-[#EDEEFF] mb-2">
        Token Issuance Schedule
      </h2>
      <p className="text-[#8A8FBF] mb-6">Next price increase in:</p>
      <div className="flex justify-center gap-4 mb-8">
        <div className="bg-[#060A2A] rounded-lg shadow-md p-4 min-w-[80px] border border-[#8A8FBF]/20">
          <div className="text-3xl font-bold text-[#F897FE]">{timeLeft.days}</div>
          <div className="text-sm text-[#8A8FBF]">Days</div>
        </div>
        <div className="bg-[#060A2A] rounded-lg shadow-md p-4 min-w-[80px] border border-[#8A8FBF]/20">
          <div className="text-3xl font-bold text-[#F897FE]">{timeLeft.hours}</div>
          <div className="text-sm text-[#8A8FBF]">Hours</div>
        </div>
        <div className="bg-[#060A2A] rounded-lg shadow-md p-4 min-w-[80px] border border-[#8A8FBF]/20">
          <div className="text-3xl font-bold text-[#F897FE]">{timeLeft.minutes}</div>
          <div className="text-sm text-[#8A8FBF]">Minutes</div>
        </div>
        <div className="bg-[#060A2A] rounded-lg shadow-md p-4 min-w-[80px] border border-[#8A8FBF]/20">
          <div className="text-3xl font-bold text-[#F897FE]">{timeLeft.seconds}</div>
          <div className="text-sm text-[#8A8FBF]">Seconds</div>
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
      <div className="bg-[#060A2A] rounded-xl shadow-lg p-8 border border-[#8A8FBF]/20">
        <h3 className="text-xl font-bold text-[#EDEEFF] mb-6 text-center">MARKEE Token Issuance Phases</h3>

        {/* Progress Bar */}
        <div className="relative mb-8">
          <div className="h-3 bg-[#0A0F3D] rounded-full overflow-hidden border border-[#8A8FBF]/20">
            <div 
              className="h-full bg-gradient-to-r from-[#F897FE] via-[#935AF0] to-[#7B6AF4] transition-all duration-1000"
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
                    ? 'border-[#F897FE] bg-[#F897FE]/10 shadow-lg shadow-[#F897FE]/20 scale-105'
                    : isPast
                    ? 'border-[#8A8FBF]/30 bg-[#0A0F3D] opacity-60'
                    : 'border-[#8A8FBF]/30 bg-[#0A0F3D] opacity-50'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-[#F897FE] text-[#060A2A] text-xs font-bold px-3 py-1 rounded-full">
                      ACTIVE
                    </span>
                  </div>
                )}

                <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${phase.color}`} />

                <div className="text-center">
                  <div className={`text-sm font-semibold mb-1 ${
                    isCurrent ? 'text-[#F897FE]' : 'text-[#8A8FBF]'
                  }`}>
                    {phase.label}
                  </div>
                  <div className={`text-2xl font-bold mb-1 ${
                    isCurrent ? 'text-[#EDEEFF]' : 'text-[#8A8FBF]'
                  }`}>
                    {phase.rate.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#8A8FBF]">MARKEE / ETH</div>
                  <div className="text-xs text-[#8A8FBF] mt-2">
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
            className="bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#7C9CFF] transition-colors inline-block"
          >
            Buy a Message to Join
          </Link>
          <p className="text-sm text-[#8A8FBF] mt-2">
            Phases are preset in the Cooperative's RevNet
          </p>
        </div>
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
