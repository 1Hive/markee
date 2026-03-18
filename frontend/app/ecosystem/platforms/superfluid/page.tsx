'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Zap, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Star,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import Image from 'next/image'
import { RewardsModal } from '@/components/modals/RewardsModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPERFLUID_FACTORY_ADDRESS = '0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d' as const

const FACTORY_ABI = [
  {
    inputs: [
      { name: '_beneficiaryAddress', type: 'address' },
      { name: '_leaderboardName', type: 'string' },
    ],
    name: 'createLeaderboard',
    outputs: [
      { name: 'leaderboardAddress', type: 'address' },
      { name: 'seedMarkeeAddress', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuperfluidLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  minimumPrice: string
  minimumPriceRaw: string
  topFundsAddedRaw: string
  topMessage: string | null
  topMessageOwner: string | null
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuperfluidPlatformPage() {
  const { address: walletAddress } = useAccount()
  const [leaderboards, setLeaderboards] = useState<SuperfluidLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [rewardsModalOpen, setRewardsModalOpen] = useState(false)

  const fetchLeaderboards = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoadingLeaderboards(true)
      else setIsRefreshing(true)
      const res = await fetch('/api/superfluid/leaderboards')
      if (res.ok) {
        const data = await res.json()
        setLeaderboards(data.leaderboards ?? [])
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingLeaderboards(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const onFocus = () => fetchLeaderboards(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchLeaderboards])

  useEffect(() => {
    fetchLeaderboards()
  }, [fetchLeaderboards])

  const formatFunds = (eth: string) => {
    const n = parseFloat(eth)
    if (n === 0) return '0 ETH'
    if (n < 0.001) return '< 0.001 ETH'
    return `${n.toFixed(4)} ETH`
  }

  const myLeaderboards = walletAddress
    ? leaderboards.filter(l => l.admin.toLowerCase() === walletAddress.toLowerCase())
    : []

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Ecosystem</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <Link href="/ecosystem/platforms" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Platforms</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">Superfluid</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30 overflow-hidden flex-shrink-0">
                <Image src="/partners/superfluid.png" alt="Superfluid" width={48} height={48} className="object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold text-[#EDEEFF]">Superfluid</h1>
                  <span className="flex items-center gap-1.5 bg-[#1DB227]/15 border border-[#1DB227]/40 text-[#1DB227] text-xs font-semibold px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1DB227] animate-pulse" />
                    Season 5
                  </span>
                </div>
                <p className="text-[#8A8FBF] max-w-xl">
                  A digital sign for your Superfluid project. Anyone can pay to set the message — your treasury earns 62% of every payment, and buyers earn MARKEE tokens.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRewardsModalOpen(true)}
                className="flex items-center gap-2 bg-[#0A0F3D] text-[#F897FE] border border-[#F897FE]/40 px-5 py-3 rounded-lg font-semibold hover:bg-[#F897FE]/10 transition-colors whitespace-nowrap"
              >
                <Star size={16} />
                S5 Rewards
              </button>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
              >
                <Plus size={18} />
                Create a Markee
              </button>
            </div>
          </div>

          <div className="flex items-center gap-8 mt-10">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{leaderboards.length}</span>
              <span className="text-[#8A8FBF]">active signs</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trophy size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">{formatFunds(totalPlatformFunds)}</span>
              <span className="text-[#8A8FBF]">total funded</span>
            </div>
            <button
              onClick={() => fetchLeaderboards(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors text-xs disabled:opacity-40 ml-auto"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Fund your treasury passively',
                body: 'Your project treasury receives 62% of every payment made on your sign. No active management required — it runs onchain, forever.',
              },
              {
                step: '2',
                title: 'Build mindshare in the ecosystem',
                body: 'Your sign surfaces your project to the entire Markee network. Buyers compete to hold the top message, keeping attention on your community.',
              },
              {
                step: '3',
                title: 'Grow the Markee Cooperative',
                body: 'Every purchase mints MARKEE tokens for the buyer. The 38% that goes to the Cooperative funds the protocol that runs your sign.',
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1DB227]/15 border border-[#1DB227]/40 flex items-center justify-center text-[#1DB227] text-sm font-bold">
                  {step}
                </div>
                <div>
                  <h3 className="text-[#EDEEFF] font-semibold mb-1">{title}</h3>
                  <p className="text-[#8A8FBF] text-sm">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signs grid */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoadingLeaderboards ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse h-48" />
              ))}
            </div>
          ) : leaderboards.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Zap size={40} className="text-[#1DB227] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No signs yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Be the first Superfluid project to create a Markee.</p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
              >
                <Plus size={18} />
                Create a Markee
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={20} className="text-[#F897FE]" />
                <h2 className="text-2xl font-bold text-[#EDEEFF]">Active Signs</h2>
                <span className="text-[#8A8FBF] text-sm">ranked by total funds</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {leaderboards.map((lb, idx) => (
                  <LeaderboardCard
                    key={lb.address}
                    leaderboard={lb}
                    rank={idx + 1}
                    formatFunds={formatFunds}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />

      {createModalOpen && (
        <CreateMarkeeModal
          myLeaderboards={myLeaderboards}
          walletAddress={walletAddress}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={fetchLeaderboards}
        />
      )}

      <RewardsModal
        isOpen={rewardsModalOpen}
        onClose={() => setRewardsModalOpen(false)}
        title="S5 Rewards"
        description="Earn points by buying messages and adding funds on the Superfluid Markee."
      />
    </div>
  )
}

// ─── Leaderboard Card ─────────────────────────────────────────────────────────

function LeaderboardCard({
  leaderboard,
  rank,
  formatFunds,
}: {
  leaderboard: SuperfluidLeaderboard
  rank: number
  formatFunds: (eth: string) => string
}) {
  const router = useRouter()

  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const minPriceRaw = BigInt(leaderboard.minimumPriceRaw ?? '0')
  const topFunds = BigInt(leaderboard.topFundsAddedRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = Number(buyPrice) / 1e18

  return (
    <div
      onClick={() => router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)}
      className="bg-[#0A0F3D] p-6 rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0">
          <Zap size={22} className="text-[#1DB227]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#EDEEFF] text-lg truncate">{leaderboard.name}</h3>
          <span className="text-[#8A8FBF] text-xs font-mono">
            {leaderboard.address.slice(0, 8)}…{leaderboard.address.slice(-6)}
          </span>
        </div>
      </div>

      {leaderboard.topMessage ? (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 hover:border-[#7C9CFF]/50 transition-colors flex flex-col min-h-[120px]">
          <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2 flex-1">
            {leaderboard.topMessage}
          </p>
          {leaderboard.topMessageOwner && (
            <p className="text-[#8A8FBF] text-xs text-right mt-auto">
              - {leaderboard.topMessageOwner}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center min-h-[120px] flex flex-col items-center justify-center">
          <div className="text-4xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">Be the first to buy a message</p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-[#7C9CFF] font-medium">
          {formatFunds(leaderboard.totalFunds)} total raised.
        </span>
        <span className="text-[#8A8FBF]">
          {leaderboard.markeeCount} {leaderboard.markeeCount === 1 ? 'message' : 'messages'}
        </span>
      </div>

      <button
        onClick={e => {
          e.stopPropagation()
          router.push(`/ecosystem/platforms/superfluid/${leaderboard.address}`)
        }}
        className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
      >
        {buyPriceFormatted.toFixed(3)} ETH to change
      </button>
    </div>
  )
}

// ─── Create Markee Modal ──────────────────────────────────────────────────────

function CreateMarkeeModal({
  myLeaderboards,
  walletAddress,
  onClose,
  onSuccess,
}: {
  myLeaderboards: SuperfluidLeaderboard[]
  walletAddress?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const router = useRouter()
  const { isConnected } = useAccount()
  const [leaderboardName, setLeaderboardName] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    let foundAddress: string | null = null
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === SUPERFLUID_FACTORY_ADDRESS.toLowerCase() &&
        log.topics[1]
      ) {
        foundAddress = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    setNewLeaderboardAddress(foundAddress)
    onSuccess()
  }, [isSuccess, receipt, onSuccess])

  const handleCreate = () => {
    setError(null)
    if (!leaderboardName.trim()) { setError('Enter a name for your sign.'); return }
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setError('Enter a valid Ethereum address.')
      return
    }
    writeContract({
      address: SUPERFLUID_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [beneficiary as `0x${string}`, leaderboardName.trim()],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">Markee created!</p>
            <p className="text-[#8A8FBF] text-sm text-center">
              Your sign is live on the Superfluid platform.
            </p>
            <div className="flex flex-col gap-3 w-full mt-2">
              <button
                onClick={() =>
                  newLeaderboardAddress &&
                  router.push(`/ecosystem/platforms/superfluid/${newLeaderboardAddress}`)
                }
                className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
              >
                View your Markee →
              </button>
              <button
                onClick={onClose}
                className="text-[#8A8FBF] text-sm hover:text-[#EDEEFF] transition-colors text-center"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                <Zap size={20} className="text-[#1DB227]" />
              </div>
              <div>
                <h2 className="text-[#EDEEFF] font-bold text-lg">Create a Markee</h2>
                <p className="text-[#8A8FBF] text-xs">Superfluid — Season 5</p>
              </div>
            </div>

            {myLeaderboards.length > 0 && (
              <div className="mb-6">
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-3">Your Signs</div>
                <div className="space-y-2">
                  {myLeaderboards.map(lb => (
                    <div
                      key={lb.address}
                      className="flex items-center justify-between bg-[#060A2A] rounded-lg px-4 py-3 border border-[#8A8FBF]/15"
                    >
                      <p className="text-[#EDEEFF] text-sm truncate">{lb.name}</p>
                      <a
                        href={`/ecosystem/platforms/superfluid/${lb.address}`}
                        className="flex-shrink-0 text-xs text-[#F897FE] hover:text-[#7C9CFF] transition-colors ml-4"
                      >
                        View →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isConnected ? (
              <div className="space-y-3">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to create a Markee.</p>
                <ConnectButton />
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Sign Name <span className="text-[#F897FE]">*</span>
                  </label>
                  <input
                    type="text"
                    value={leaderboardName}
                    onChange={e => setLeaderboardName(e.target.value)}
                    placeholder="e.g. My Superfluid Project"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
                  />
                  <p className="text-[#8A8FBF] text-xs mt-1.5">Shown publicly on the platform.</p>
                </div>

                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Treasury Address <span className="text-[#F897FE]">*</span>
                  </label>
                  <input
                    type="text"
                    value={beneficiary}
                    onChange={e => setBeneficiary(e.target.value)}
                    placeholder="0x…"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                  />
                  <p className="text-[#8A8FBF] text-xs mt-1.5">62% of every payment goes here.</p>
                </div>

                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-sm">
                  <div className="text-[#8A8FBF] text-xs mb-3 uppercase tracking-wider">Revenue split</div>
                  <div className="flex justify-between">
                    <span className="text-[#EDEEFF]">Your treasury</span>
                    <span className="text-[#F897FE] font-semibold">62%</span>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[#EDEEFF]">Markee Cooperative</span>
                    <span className="text-[#7C9CFF] font-semibold">38%</span>
                  </div>
                </div>

                {(error || writeError) && (
                  <div className="flex items-start gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error ?? writeError?.message}</span>
                  </div>
                )}

                <button
                  onClick={handleCreate}
                  disabled={isPending || isConfirming}
                  className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}
                    </>
                  ) : (
                    'Create a Markee'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
