'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Menu, X, ChevronRight } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { MarkeeCard } from '@/components/leaderboard/MarkeeCard'
import { LeaderboardSkeleton } from '@/components/leaderboard/MarkeeCardSkeleton'
import { TopDawgModal } from '@/components/modals/TopDawgModal'
import { PARTNERS } from '@/hooks/usePartnerMarkees'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { formatDistanceToNow } from 'date-fns'
import type { Markee } from '@/types'

const MARKEE_ABI = [
  parseAbiItem('function message() view returns (string)'),
  parseAbiItem('function owner() view returns (address)'),
  parseAbiItem('function name() view returns (string)'),
  parseAbiItem('function totalFundsAdded() view returns (uint256)')
] as const

export default function PartnerPage() {
  const params = useParams()
  const { address } = useAccount()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<Markee | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'addFunds' | 'updateMessage'>('create')

  // Find the partner
  const partner = PARTNERS.find(p => p.slug === params.partner)

  // Fetch markees for this partner
  const fetchMarkees = useCallback(async () => {
    if (!partner) return

    try {
      setIsLoading(true)
      setError(null)

      const client = createPublicClient({
        chain: base,
        transport: http()
      })

      // Get MarkeeCreated events
      const events = await client.getLogs({
        address: partner.strategyAddress as `0x${string}`,
        event: parseAbiItem('event MarkeeCreated(address indexed markeeAddress, address indexed owner, uint256 initialAmount, string message)'),
        fromBlock: 'earliest',
        toBlock: 'latest'
      })

      if (events.length === 0) {
        setMarkees([])
        setLastUpdated(new Date())
        setIsLoading(false)
        return
      }

      // Fetch details for each markee
      const markeeData = await Promise.all(
        events.map(async (event) => {
          const markeeAddress = event.args.markeeAddress as `0x${string}`
          
          try {
            const [message, owner, name, totalFundsAdded] = await Promise.all([
              client.readContract({
                address: markeeAddress,
                abi: MARKEE_ABI,
                functionName: 'message'
              }),
              client.readContract({
                address: markeeAddress,
                abi: MARKEE_ABI,
                functionName: 'owner'
              }),
              client.readContract({
                address: markeeAddress,
                abi: MARKEE_ABI,
                functionName: 'name'
              }).catch(() => ''),
              client.readContract({
                address: markeeAddress,
                abi: MARKEE_ABI,
                functionName: 'totalFundsAdded'
              })
            ])

            return {
              address: markeeAddress,
              message: message as string,
              owner: owner as string,
              name: name as string,
              totalFundsAdded: totalFundsAdded as bigint,
              strategyAddress: partner.strategyAddress,
              chainId: base.id
            } as Markee
          } catch (err) {
            console.error(`Error fetching markee ${markeeAddress}:`, err)
            return null
          }
        })
      )

      // Filter and sort
      const validMarkees = markeeData.filter((m): m is Markee => m !== null)
      validMarkees.sort((a, b) => Number(b.totalFundsAdded - a.totalFundsAdded))

      setMarkees(validMarkees)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching markees:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch markees'))
    } finally {
      setIsLoading(false)
    }
  }, [partner])

  useEffect(() => {
    fetchMarkees()
  }, [fetchMarkees])

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

  const handleTransactionSuccess = () => {
    // Refetch after a delay to allow subgraph to index
    setTimeout(() => {
      fetchMarkees()
    }, 3000)
  }

  if (!partner) {
    return (
      <div className="min-h-screen bg-[#060A2A] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#EDEEFF] mb-4">Partner Not Found</h1>
          <Link href="/ecosystem" className="text-[#F897FE] hover:underline">
            ← Back to Ecosystem
          </Link>
        </div>
      </div>
    )
  }

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
                <Link href="/ecosystem" className="text-[#F897FE] font-medium">Ecosystem</Link>
                <Link href="/owners" className="text-[#B8B6D9] hover:text-[#F897FE]">Owners</Link>
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
                  className="text-[#F897FE] font-medium py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Ecosystem
                </Link>
                <Link 
                  href="/owners" 
                  className="text-[#B8B6D9] hover:text-[#F897FE] py-2"
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

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
              Ecosystem
            </Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">{partner.name}</span>
          </div>
        </div>
      </section>

      {/* Partner Header */}
      <section className="bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6 mb-6">
            <img src={partner.logo} alt={partner.name} className="h-16 w-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-[#EDEEFF] mb-2">{partner.name} Messages</h1>
              <p className="text-[#8A8FBF]">{partner.description}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <div className="text-sm text-[#8A8FBF]">
                  Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </div>
              )}
            </div>

            <button 
              onClick={handleCreateNew}
              className="bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
            >
              Buy a Message
            </button>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="bg-[#060A2A] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading && markees.length === 0 && (
            <div>
              <LeaderboardSkeleton />
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <div className="bg-[#FF8E8E]/20 border border-[#FF8E8E] rounded-lg p-6 max-w-lg mx-auto">
                <p className="text-[#8BC8FF] font-medium mb-2">Error loading messages</p>
                <p className="text-[#8A8FBF] text-sm">{error.message}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && markees.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-[#0A0F3D] rounded-lg p-8 max-w-lg mx-auto border border-[#8A8FBF]/20">
                <div className="text-6xl mb-4">🪧</div>
                <p className="text-[#8A8FBF] text-lg mb-4">No messages yet for {partner.name}</p>
                <button 
                  onClick={handleCreateNew}
                  className="bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
                >
                  Be the First!
                </button>
              </div>
            </div>
          )}

          {markees.length > 0 && (
            <div>
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
                <div className="bg-[#0A0F3D] rounded-lg shadow-sm p-6 border border-[#8A8FBF]/20">
                  <h4 className="text-lg font-semibold text-[#EDEEFF] mb-4">More Messages</h4>
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
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Modal */}
      <TopDawgModal 
        isOpen={isModalOpen}
        onClose={handleModalClose}
        userMarkee={selectedMarkee}
        initialMode={modalMode}
        onSuccess={handleTransactionSuccess}
        strategyAddress={partner.strategyAddress as `0x${string}`}
      />
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
