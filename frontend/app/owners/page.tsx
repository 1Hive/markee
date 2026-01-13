'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'

// Phase configuration
const PHASES = [
  { 
    phase: 0, 
    rate: 100000, 
    endDate: new Date('2026-03-21T00:00:00Z'),
    label: 'Phase 0',
    color: 'bg-[#935AF0]'
  },
  { 
    phase: 1, 
    rate: 50000, 
    endDate: new Date('2026-06-21T00:00:00Z'),
    label: 'Phase 1',
    color: 'bg-[#7B6AF4]'
  },
  { 
    phase: 2, 
    rate: 25000, 
    endDate: new Date('2026-09-21T00:00:00Z'),
    label: 'Phase 2',
    color: 'bg-[#6A4AE3]'
  },
  { 
    phase: 3, 
    rate: 12500, 
    endDate: new Date('2026-12-21T00:00:00Z'),
    label: 'Phase 3',
    color: 'bg-[#4B3ACC]'
  },
  { 
    phase: 4, 
    rate: 6250, 
    endDate: new Date('2027-03-21T00:00:00Z'),
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
  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="owners" />

      {/* Hero */}
      <section className="relative py-24 overflow-hidden border-b border-[#8A8FBF]/20">
        {/* Cosmic background */}
        <HeroBackground />
        
        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
              <p className="text-sm text-[#8A8FBF] mb-4">Wyoming LLC</p>
              
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

      {/* RevNet Terms Link */}
      <section className="py-12 bg-[#0A0F3D]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-2xl font-bold text-[#EDEEFF] mb-4">Full RevNet Terms</h3>
          <p className="text-[#B8B6D9] mb-6">
            View complete tokenomics, reserve rates, and governance parameters on-chain.
          </p>
          <a 
            href="https://www.revnet.app/v5:base:119/terms" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
          >
            View on RevNets →
          </a>
        </div>
      </section>

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
        <h3 className="text-xl font-bold text-[#EDEEFF] mb-6 text-center">MARKEE Token Issuance</h3>

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
            href="/ecosystem/markee-cooperative"
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
