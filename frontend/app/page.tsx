'use client'

import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { useState, useEffect } from 'react'

// Phase configuration
const PHASES = [
  { 
    phase: 0, 
    rate: 50000, 
    endDate: new Date('2025-12-21T00:00:00Z'),
    label: 'Phase 0',
    color: 'bg-green-500'
  },
  { 
    phase: 1, 
    rate: 30000, 
    endDate: new Date('2026-03-21T00:00:00Z'),
    label: 'Phase 1',
    color: 'bg-blue-500'
  },
  { 
    phase: 2, 
    rate: 24000, 
    endDate: new Date('2026-06-21T00:00:00Z'),
    label: 'Phase 2',
    color: 'bg-purple-500'
  },
  { 
    phase: 3, 
    rate: 20000, 
    endDate: new Date('2026-09-21T00:00:00Z'),
    label: 'Phase 3',
    color: 'bg-orange-500'
  },
  { 
    phase: 4, 
    rate: 17000, 
    endDate: new Date('2026-12-21T00:00:00Z'),
    label: 'Phase 4',
    color: 'bg-red-500'
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
          <div className="text-3xl font-bold text-blue-600">{timeLeft.days}</div>
          <div className="text-sm text-gray-600">Days</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-blue-600">{timeLeft.hours}</div>
          <div className="text-sm text-gray-600">Hours</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-blue-600">{timeLeft.minutes}</div>
          <div className="text-sm text-gray-600">Minutes</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 min-w-[80px]">
          <div className="text-3xl font-bold text-blue-600">{timeLeft.seconds}</div>
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
              className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 transition-all duration-1000"
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
                    ? 'border-blue-500 bg-blue-50 shadow-lg scale-105'
                    : isPast
                    ? 'border-gray-300 bg-gray-100 opacity-60'
                    : 'border-gray-300 bg-white opacity-50'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                      ACTIVE
                    </span>
                  </div>
                )}
                
                <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${phase.color}`} />
                
                <div className="text-center">
                  <div className={`text-sm font-semibold mb-1 ${
                    isCurrent ? 'text-blue-600' : 'text-gray-600'
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
          <button className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors">
            Create Your Markee Now
          </button>
          <p className="text-sm text-gray-500 mt-2">
            Lock in the current rate before it increases
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const { markees, isLoading, error } = useMarkees()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-blue-600">Markee</h1>
            <nav className="flex gap-6">
              <Link href="/" className="text-blue-600 font-medium">Home</Link>
              <Link href="/investors" className="text-gray-600 hover:text-gray-900">For Investors</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Hero Section - Fixed Price Messages */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-50 py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6 text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-gray-900 mb-2">This is a sign</div>
              <div className="text-sm text-gray-500">100 ETH to change</div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-gray-900 mb-2">Anyone can pay to change</div>
              <div className="text-sm text-gray-500">100 ETH to change</div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 text-center border-2 border-blue-200">
              <div className="text-2xl font-bold text-gray-900 mb-2">that funds communities</div>
              <div className="text-sm text-gray-500">100 ETH to change</div>
            </div>
          </div>
        </div>
      </section>

      {/* Countdown and Phase Visualization Section */}
      <section className="bg-gradient-to-br from-gray-50 to-blue-50 py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CountdownTimer />
          <PhaseVisualization />
        </div>
      </section>

      {/* Leaderboard */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h3 className="text-2xl font-bold text-gray-900 mb-8">Leaderboard</h3>
        
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading Markees...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <p className="text-red-600">Error loading Markees: {error.message}</p>
          </div>
        )}

        {!isLoading && !error && markees.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No Markees yet. Be the first to invest!</p>
          </div>
        )}

        {!isLoading && !error && markees.length > 0 && (
          <>
            {/* #1 Spot - Full Width */}
            {markees[0] && <MarkeeCard markee={markees[0]} rank={1} size="hero" />}

            {/* #2 and #3 - Two Column */}
            {markees.length > 1 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {markees[1] && <MarkeeCard markee={markees[1]} rank={2} size="large" />}
                {markees[2] && <MarkeeCard markee={markees[2]} rank={3} size="large" />}
              </div>
            )}

            {/* #4-26 - Grid */}
            {markees.length > 3 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {markees.slice(3, 26).map((markee, index) => (
                  <MarkeeCard key={markee.address} markee={markee} rank={index + 4} size="medium" />
                ))}
              </div>
            )}

            {/* #27+ - List View */}
            {markees.length > 26 && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">More Investors</h4>
                <div className="space-y-2">
                  {markees.slice(26).map((markee, index) => (
                    <MarkeeCard key={markee.address} markee={markee} rank={index + 27} size="list" />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
