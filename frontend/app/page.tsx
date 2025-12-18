'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { useMarkees } from '@/lib/contracts/useMarkees'
import { useFixedMarkees } from '@/lib/contracts/useFixedMarkees'
import { useReactions } from '@/hooks/useReactions'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { InvestmentModal } from '@/components/modals/InvestmentModal'
import { FixedMarkeeModal } from '@/components/modals/FixedMarkeeModal'

import { formatDistanceToNow } from 'date-fns'
import { formatEther } from 'viem'
import type { Markee } from '@/types'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

function PartnerLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex items-center justify-center h-32 p-6">
      <img src={src} alt={alt} className="max-h-20 max-w-full object-contain" />
    </div>
  )
}

export default function Home() {
  const { address } = useAccount()
  const { markees, isLoading, isFetchingFresh, error, lastUpdated, refetch } = useMarkees()
  const { markees: fixedMarkees, isLoading: isLoadingFixed } = useFixedMarkees()
  const { reactions, addReaction, isLoading: reactionsLoading, error: reactionsError } = useReactions()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  const [isFixedModalOpen, setIsFixedModalOpen] = useState(false)
  const [selectedFixedMarkee, setSelectedFixedMarkee] = useState<FixedMarkee | null>(null)
  
  const [refetchTimeout, setRefetchTimeout] = useState<NodeJS.Timeout | null>(null)

  // Debounced refetch - waits 3 seconds after transaction to give subgraph time to index
  const debouncedRefetch = useCallback(() => {
    // Clear any pending refetch
    if (refetchTimeout) {
      clearTimeout(refetchTimeout)
    }
    
    // Schedule new refetch after 3 seconds
    const timeout = setTimeout(() => {
      console.log('[Markees] Refetching after transaction success')
      refetch()
    }, 3000)
    
    setRefetchTimeout(timeout)
  }, [refetch, refetchTimeout])

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

  const handleReact = async (markee: Markee, emoji: string) => {
    if (!address) {
      console.error('Wallet not connected')
      return
    }

    try {
      await addReaction(markee.address, emoji, markee.chainId)
    } catch (err) {
      console.error('Failed to add reaction:', err)
      // Error is already handled in the hook
    }
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
    <div className="min-h-screen bg-[#060A2A]">
      {/* Header */}
      <header className="bg-[#0A0F3D] border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
            </Link>
            <nav className="flex gap-6">
              <Link href="/how-it-works" className="text-[#B8B6D9] hover:text-[#F897FE]">How it Works</Link>
              <Link href="/ecosystem" className="text-[#B8B6D9] hover:text-[#F897FE]">Ecosystem</Link>
              <Link href="/owners" className="text-[#B8B6D9] hover:text-[#F897FE]">Owners</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

{/* Hero Section - Fixed Price Messages (Readerboard Style) */}
<section className="bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {isLoadingFixed ? (
        // Loading state
        <>
          {[1, 2, 3].map((i) => (
            <div key={i} className="readerboard-card animate-pulse">
              <div className="readerboard-inner">
                <div className="h-16 bg-[#8A8FBF]/20 rounded mx-8"></div>
              </div>
            </div>
          ))}
        </>
      ) : (
        // Real data - Readerboard styled
        fixedMarkees.map((fixedMarkee, index) => (
          <button
            key={index}
            onClick={() => handleFixedMarkeeClick(fixedMarkee)}
            className="group readerboard-card cursor-pointer transition-all hover:shadow-2xl hover:shadow-[#F897FE]/20 hover:-translate-y-1"
          >
            {/* Readerboard inner area with grooves */}
            <div className="readerboard-inner">
              {/* Message text */}
              <div className="readerboard-text">
                {(fixedMarkee.message || fixedMarkee.name).toUpperCase()}
              </div>
            </div>

            {/* Hover price indicator */}
            <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100">
              <div className="bg-[#F897FE] text-[#060A2A] text-sm font-semibold px-6 py-2 rounded-full shadow-lg whitespace-nowrap">
                {fixedMarkee.price ? `${formatEther(fixedMarkee.price)} ETH to change` : 'Loading...'}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  </div>
</section>

<style jsx>{`
  .readerboard-card {
    position: relative;
    background: #F897FE;
    border-radius: 4px;
    padding: 4px;
    box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.6);
    aspect-ratio: 2 / 1;
  }

  .readerboard-inner {
    position: relative;
    width: 100%;
    height: 100%;
    background: 
      repeating-linear-gradient(
        0deg,
        #0A0F3D 0px,
        #0A0F3D 28px,
        #060A2A 28px,
        #060A2A 30px
      );
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    overflow: hidden;
  }

  .readerboard-text {
    font-family: Barlow, Georgia, 'Times New Roman', serif;
    font-size: clamp(18px, 3vw, 28px);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.5px;
    color: #EDEEFF;
    text-align: center;
    word-wrap: break-word;
    max-width: 100%;
    transition: all 0.2s ease;
  }

  .group:hover .readerboard-text {
    color: #F897FE;
    transform: scale(1.02);
  }

  @media (max-width: 768px) {
    .readerboard-card {
      aspect-ratio: 5 / 3;
    }
    
    .readerboard-text {
      font-size: 20px;
    }
  }
`}</style>

{/* Integration Partners - Coming Soon */}
<section className="bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20">
  <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 className="text-2xl font-bold text-[#EDEEFF] mb-8 text-center">Coming Soon to...</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
      <PartnerLogo src="/partners/gardens.png" alt="Gardens" />
      <PartnerLogo src="/partners/juicebox.png" alt="Juicebox" />
      <PartnerLogo src="/partners/revnets.png" alt="RevNets" />
      <PartnerLogo src="/partners/breadcoop.png" alt="Bread Coop" />
    </div>
    <div className="text-center mt-8">
      <Link 
        href="/ecosystem"
        className="inline-block bg-[#7C9CFF] text-[#060A2A] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#F897FE] transition-colors"
      >
        Explore our Ecosystem
      </Link>
    </div>
  </div>
</section>

{/* Leaderboard */}
<section className="bg-[#060A2A] py-16">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="text-center mb-8">
      <h3 className="text-3xl font-bold text-[#EDEEFF] mb-6">Markee Leaderboard 🏅</h3>

       <p className="text-lg text-[#8A8FBF] mb-6">
        Top Messages by Total Funds Added.
      </p>

      {/* CTA Buttons - moved here */}
      <div className="flex gap-4 justify-center mb-8">
        <button 
          onClick={handleCreateNew}
          className="bg-[#F897FE] text-[#060A2A] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#7C9CFF] transition-colors"
        >
          Buy a Message
        </button>
        <Link 
          href="/how-it-works"
          className="bg-[#0A0F3D] text-[#F897FE] border-2 border-[#F897FE] px-8 py-3 rounded-lg font-semibold text-lg hover:bg-[#F897FE]/10 transition-colors"
        >
          How it Works
        </Link>
      </div>
    </div>

    <div className="flex items-center justify-between mb-8">
      {/* Status indicator */}
      <div className="flex items-center gap-3 ml-auto">
        {(isFetchingFresh || reactionsLoading) && (
          <div className="flex items-center gap-2 text-sm text-[#8A8FBF]">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#F897FE]"></div>
            <span>Updating...</span>
          </div>
        )}
        {lastUpdated && !isLoading && (
          <div className="text-sm text-[#8A8FBF]">
            Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </div>
        )}
      </div>
    </div>

    {/* Error display for reactions */}
    {reactionsError && (
      <div className="mb-4 p-4 bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg text-[#8BC8FF] max-w-2xl mx-auto">
        <p className="text-sm">{reactionsError}</p>
      </div>
    )}

    {isLoading && markees.length === 0 && (
      <div>
        <LeaderboardSkeleton />
      </div>
    )}

    {error && (
      <div className="text-center py-12">
        <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 max-w-lg mx-auto">
          <p className="text-[#8BC8FF] font-medium mb-2">Error loading Markees</p>
          <p className="text-[#8A8FBF] text-sm">{error.message}</p>
        </div>
      </div>
    )}

    {!isLoading && !error && markees.length === 0 && (
      <div className="text-center py-12">
        <div className="bg-[#0A0F3D] rounded-lg p-8 max-w-lg mx-auto border border-[#8A8FBF]/20">
          <div className="text-6xl mb-4">🪧</div>
          <p className="text-[#8A8FBF] text-lg">No Markees yet. Be the first!</p>
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
            onReact={handleReact}
            reactions={reactions.get(markees[0].address.toLowerCase())}
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
                onReact={handleReact}
                reactions={reactions.get(markees[1].address.toLowerCase())}
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
                onReact={handleReact}
                reactions={reactions.get(markees[2].address.toLowerCase())}
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
                onReact={handleReact}
                reactions={reactions.get(markee.address.toLowerCase())}
              />
            ))}
          </div>
        )}

        {/* #27+ - List View */}
        {markees.length > 26 && (
          <div className="bg-[#0A0F3D] rounded-lg shadow-sm p-6 border border-[#8A8FBF]/20">
            <h4 className="text-lg font-semibold text-[#EDEEFF] mb-4">More Investors</h4>
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
                  onReact={handleReact}
                  reactions={reactions.get(markee.address.toLowerCase())}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
</section>

      {/* Footer */}
      <footer className="bg-[#0A0F3D] text-[#EDEEFF] py-4 border-t border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center">
            <div className="flex gap-6 mb-4">
              {/* X (Twitter) */}
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
              
              {/* Discord */}
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
              
              {/* Telegram */}
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
              
              {/* Farcaster */}
              <a 
                href="https://warpcast.com/markee" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-[#F897FE] transition-colors"
                aria-label="Farcaster"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.24 6.24h-2.226v11.376h2.226V6.24zm-4.596 0H10.67v11.376h2.974V6.24zM5.76 6.24H3.534v11.376H5.76V6.24zm-.29 13.38H3.243v1.14H5.47v-1.14zm13.29 0h-2.226v1.14h2.226v-1.14zm-4.887 0h-2.707v1.14h2.707v-1.14zM3.243 3.24h2.226V4.38H3.243V3.24zm4.427 0h2.974V4.38H7.67V3.24zm6.073 0h2.226V4.38h-2.226V3.24z"/>
                </svg>
              </a>
            </div>
            
            <div className="text-sm text-[#8A8FBF]">
              © 2025 Markee
            </div>
          </div>
        </div>
      </footer>

      {/* Investment Modal */}
      <InvestmentModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={debouncedRefetch}
      />

      {/* Fixed Markee Modal */}
      <FixedMarkeeModal 
        isOpen={isFixedModalOpen}
        onClose={handleFixedModalClose}
        fixedMarkee={selectedFixedMarkee}
        onSuccess={debouncedRefetch}
      />
    </div>
  )
}
