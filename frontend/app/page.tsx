'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { useFixedMarkees } from '@/lib/contracts/useFixedMarkees'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { InvestmentModal } from '@/components/modals/InvestmentModal'
import { FixedMarkeeModal } from '@/components/modals/FixedMarkeeModal'

import { formatDistanceToNow } from 'date-fns'
import { formatEther } from 'viem'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

export default function Home() {
  const { address } = useAccount()
  const { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch } = useMarkees()
  const { markees: fixedMarkees, isLoading: isLoadingFixed } = useFixedMarkees()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false)
  const [selectedFixedMarkee, setSelectedFixedMarkee] = useState<FixedMarkee | null>(null)

  const handleCreateNew = () => {
    setSelectedMarkee(null)
    setModalMode('create')
    setIsModalOpen(true)
  }

  const handleEditMessage = (markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('updateMessage')
    setIsModalOpen(true)
  }

  const handleAddFunds = (markee: Markee) => {
    setSelectedMarkee(markee)
    setModalMode('addFunds')
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedMarkee(null)
  }

  const handleFixedMarkeeClick = (fixedMarkee: FixedMarkee) => {
    setSelectedFixedMarkee(fixedMarkee)
    setIsFixedModalOpen(true)
  }

  const handleFixedModalClose = () => {
    setIsFixedModalOpen(false)
    setSelectedFixedMarkee(null)
  }

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
              <Link href="/" className="text-markee font-medium">Leaderboard</Link>
              <Link href="/info" className="text-gray-600 hover:text-gray-900">Info</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Hero Section - Fixed Price Messages */}
      <section className="bg-gradient-to-br from-markee-50 to-green-50 py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {isLoadingFixed ? (
              // Loading state
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-lg shadow-md p-6 text-center border-2 border-markee-200 animate-pulse">
                    <div className="h-6 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-100 rounded"></div>
                  </div>
                ))}
              </>
            ) : (
              // Real data
              fixedMarkees.map((fixedMarkee, index) => (
                <button
                  key={index}
                  onClick={() => handleFixedMarkeeClick(fixedMarkee)}
                  className="bg-white rounded-lg shadow-md p-6 text-center border-2 border-markee-200 hover:border-markee-400 hover:shadow-lg transition-all cursor-pointer group relative min-h-[140px] flex items-center justify-center"
                >
                  <div className="text-xl font-bold text-gray-900 line-clamp-2 group-hover:text-markee transition-colors message-text">
                    {fixedMarkee.message || fixedMarkee.name}
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-sm text-markee opacity-0 group-hover:opacity-100 transition-opacity">
                    {fixedMarkee.price ? `Pay ${formatEther(fixedMarkee.price)} ETH to change` : 'Loading...'}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h3 className="text-3xl font-bold text-gray-900 mb-6">Markee Leaderboard</h3>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={handleCreateNew}
              className="bg-markee text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-markee-600 transition-colors"
            >
              Create a Markee
            </button>
            <Link 
              href="/info"
              className="bg-white text-blue-600 border-2 border-blue-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-blue-50 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          {/* Status indicator */}
          <div className="flex items-center gap-3 ml-auto">
            {isFetchingFresh && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-markee"></div>
                <span>Updating...</span>
              </div>
            )}
            {lastUpdated && !isLoading && (
              <div className="text-sm text-gray-500">
                Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </div>
            )}
          </div>
        </div>

        {isLoading && markees.length === 0 && (
          <div>
            <LeaderboardSkeleton />
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-lg mx-auto">
              <p className="text-red-600 font-medium mb-2">Error loading Markees</p>
              <p className="text-red-500 text-sm">{error.message}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && markees.length === 0 && (
          <div className="text-center py-12">
            <div className="bg-gray-50 rounded-lg p-8 max-w-lg mx-auto">
              <div className="text-6xl mb-4">🪧</div>
              <p className="text-gray-600 text-lg">No Markees yet. Be the first!</p>
            </div>
          </div>
        )}

        {markees.length > 0 && (
          <div className={isFetchingFresh ? 'opacity-90 transition-opacity' : ''}>
            {/* #1 Spot - Full Width */}
            {markees[0] && (
              <MarkeeCard 
                markee={markees[0]} 
                rank={1} 
                size="hero"
                userAddress={address}
                onEditMessage={handleEditMessage}
                onAddFunds={handleAddFunds}
              />
            )}

            {/* #2 and #3 - Two Column */}
            {markees.length > 1 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {markees[1] && (
                  <MarkeeCard 
                    markee={markees[1]} 
                    rank={2} 
                    size="large"
                    userAddress={address}
                    onEditMessage={handleEditMessage}
                    onAddFunds={handleAddFunds}
                  />
                )}
                {markees[2] && (
                  <MarkeeCard 
                    markee={markees[2]} 
                    rank={3} 
                    size="large"
                    userAddress={address}
                    onEditMessage={handleEditMessage}
                    onAddFunds={handleAddFunds}
                  />
                )}
              </div>
            )}

            {/* #4-26 - Grid */}
            {markees.length > 3 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {markees.slice(3, 26).map((markee, index) => (
                  <MarkeeCard 
                    key={markee.address} 
                    markee={markee} 
                    rank={index + 4} 
                    size="medium"
                    userAddress={address}
                    onEditMessage={handleEditMessage}
                    onAddFunds={handleAddFunds}
                  />
                ))}
              </div>
            )}

            {/* #27+ - List View */}
            {markees.length > 26 && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">More Investors</h4>
                <div className="space-y-2">
                  {markees.slice(26).map((markee, index) => (
                    <MarkeeCard 
                      key={markee.address} 
                      markee={markee} 
                      rank={index + 27} 
                      size="list"
                      userAddress={address}
                      onEditMessage={handleEditMessage}
                      onAddFunds={handleAddFunds}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Investment Modal */}
      <InvestmentModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={() => {
          // Refresh the leaderboard after successful transaction
          refetch()
        }}
      />

      {/* Fixed Markee Modal */}
      <FixedMarkeeModal 
        isOpen={isFixedModalOpen}
        onClose={handleFixedModalClose}
        fixedMarkee={selectedFixedMarkee}
        onSuccess={() => {
          // Optionally refresh the page or refetch fixed markees
          window.location.reload()
        }}
      />
    </div>
  )
}
