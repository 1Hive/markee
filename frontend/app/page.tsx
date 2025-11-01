'use client'

import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'

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

      {/* CTA Section */}
      <section className="bg-white py-8 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Invest in Markee & Feature Your Message</h2>
          <p className="text-lg text-gray-600 mb-6">The more you invest, the more prominent your message becomes</p>
          <button className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-blue-700">
            Create Your Markee
          </button>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h3 className="text-2xl font-bold text-gray-900 mb-8">Investor Leaderboard</h3>
        
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
