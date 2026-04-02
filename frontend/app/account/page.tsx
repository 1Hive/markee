'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import {
  Github, Zap, Trophy, User, ChevronRight, ExternalLink,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BaseLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  topMessage: string | null
  topFundsAddedRaw: string
}

interface SuperfluidLeaderboard extends BaseLeaderboard {
  platform: 'superfluid'
}

interface GithubLeaderboard extends BaseLeaderboard {
  platform: 'github'
  repoFullName: string | null
  repoAvatarUrl: string | null
  repoHtmlUrl: string | null
}

type AnyLeaderboard = SuperfluidLeaderboard | GithubLeaderboard

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFunds(eth: string) {
  const n = parseFloat(eth)
  if (n === 0) return '0 ETH'
  if (n < 0.001) return '< 0.001 ETH'
  return `${n.toFixed(4)} ETH`
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const router = useRouter()
  const { address: walletAddress, isConnected } = useAccount()

  const [superfluidBoards, setSuperfluidBoards] = useState<SuperfluidLeaderboard[]>([])
  const [githubBoards, setGithubBoards] = useState<GithubLeaderboard[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchAll = useCallback(async (addr: string) => {
    setIsLoading(true)
    try {
      const [sfRes, ghRes] = await Promise.all([
        fetch('/api/superfluid/leaderboards?bust=1', { cache: 'no-store' }),
        fetch('/api/github/leaderboards?bust=1', { cache: 'no-store' }),
      ])

      if (sfRes.ok) {
        const data = await sfRes.json()
        const mine = (data.leaderboards ?? [])
          .filter((lb: BaseLeaderboard) => lb.admin.toLowerCase() === addr.toLowerCase())
          .map((lb: BaseLeaderboard) => ({ ...lb, platform: 'superfluid' as const }))
        setSuperfluidBoards(mine)
      }

      if (ghRes.ok) {
        const data = await ghRes.json()
        const mine = (data.leaderboards ?? [])
          .filter((lb: BaseLeaderboard) => lb.admin.toLowerCase() === addr.toLowerCase())
          .map((lb: BaseLeaderboard) => ({ ...lb, platform: 'github' as const }))
        setGithubBoards(mine)
      }
    } catch (err) {
      console.error('[account] fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (walletAddress) fetchAll(walletAddress)
  }, [walletAddress, fetchAll])

  const allBoards: AnyLeaderboard[] = [
    ...superfluidBoards,
    ...githubBoards,
  ].sort((a, b) => {
    const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
    return diff > 0n ? 1 : diff < 0n ? -1 : 0
  })

  const totalRaisedWei = allBoards.reduce((sum, lb) => sum + BigInt(lb.totalFundsRaw), 0n)
  const totalMessages = allBoards.reduce((sum, lb) => sum + Math.max(0, lb.markeeCount - 1), 0)

  function detailUrl(lb: AnyLeaderboard) {
    if (lb.platform === 'superfluid') return `/ecosystem/platforms/superfluid/${lb.address}`
    return `/ecosystem/platforms/github/${lb.address}`
  }

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
              Ecosystem
            </Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">My Markees</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-16 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <User size={28} className="text-[#F897FE]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#EDEEFF] mb-1">My Markees</h1>
                {walletAddress ? (
                  <p className="text-[#8A8FBF] text-sm font-mono">{shortAddr(walletAddress)}</p>
                ) : (
                  <p className="text-[#8A8FBF] text-sm">Connect your wallet to view your signs</p>
                )}
              </div>
            </div>

            {!isConnected && (
              <ConnectButton />
            )}
          </div>

          {isConnected && !isLoading && allBoards.length > 0 && (
            <div className="flex flex-wrap items-center gap-8 mt-8">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
                <span className="text-[#F897FE] font-semibold">{allBoards.length}</span>
                <span className="text-[#8A8FBF]">{allBoards.length === 1 ? 'sign' : 'signs'} created</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Trophy size={14} className="text-[#7C9CFF]" />
                <span className="text-[#7C9CFF] font-semibold">
                  {formatFunds((Number(totalRaisedWei) / 1e18).toFixed(6))}
                </span>
                <span className="text-[#8A8FBF]">total raised</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#EDEEFF] font-semibold">{totalMessages}</span>
                <span className="text-[#8A8FBF]">{totalMessages === 1 ? 'message' : 'messages'} bought</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {!isConnected ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-16 border border-[#8A8FBF]/20 text-center">
              <User size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">Connect your wallet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">See all the Markees you've created across every platform.</p>
              <ConnectButton />
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-5 animate-pulse h-28" />
              ))}
            </div>
          ) : allBoards.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-16 border border-[#8A8FBF]/20 text-center">
              <User size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No Markees yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Create your first sign on one of our platforms.</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/ecosystem/platforms/superfluid"
                  className="flex items-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 hover:border-[#F897FE]/60 text-[#EDEEFF] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Zap size={14} className="text-[#1DB227]" />
                  Superfluid
                </Link>
                <Link
                  href="/ecosystem/platforms/github"
                  className="flex items-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 hover:border-[#F897FE]/60 text-[#EDEEFF] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Github size={14} />
                  GitHub
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {superfluidBoards.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <Zap size={16} className="text-[#1DB227]" />
                    <h2 className="text-lg font-bold text-[#EDEEFF]">Superfluid</h2>
                    <span className="text-[#8A8FBF] text-sm">{superfluidBoards.length} {superfluidBoards.length === 1 ? 'sign' : 'signs'}</span>
                    <Link
                      href="/ecosystem/platforms/superfluid"
                      className="ml-auto flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
                    >
                      Platform page <ExternalLink size={11} />
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {superfluidBoards.map(lb => (
                      <AccountLeaderboardCard
                        key={lb.address}
                        leaderboard={lb}
                        detailUrl={detailUrl(lb)}
                        icon={<Zap size={18} className="text-[#1DB227]" />}
                      />
                    ))}
                  </div>
                </div>
              )}

              {githubBoards.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <Github size={16} className="text-[#EDEEFF]" />
                    <h2 className="text-lg font-bold text-[#EDEEFF]">GitHub</h2>
                    <span className="text-[#8A8FBF] text-sm">{githubBoards.length} {githubBoards.length === 1 ? 'sign' : 'signs'}</span>
                    <Link
                      href="/ecosystem/platforms/github"
                      className="ml-auto flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors"
                    >
                      Platform page <ExternalLink size={11} />
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {githubBoards.map(lb => (
                      <AccountLeaderboardCard
                        key={lb.address}
                        leaderboard={lb}
                        detailUrl={detailUrl(lb)}
                        icon={<Github size={18} className="text-[#EDEEFF]" />}
                        subtitle={(lb as GithubLeaderboard).repoFullName ?? undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AccountLeaderboardCard({
  leaderboard,
  detailUrl,
  icon,
  subtitle,
}: {
  leaderboard: AnyLeaderboard
  detailUrl: string
  icon: React.ReactNode
  subtitle?: string
}) {
  const router = useRouter()
  const hasPurchase = BigInt(leaderboard.topFundsAddedRaw ?? '0') > 0n
  const messageCount = Math.max(0, leaderboard.markeeCount - 1)

  return (
    <div
      onClick={() => router.push(detailUrl)}
      className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 transition-colors cursor-pointer p-5 flex gap-4"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0 mt-0.5">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-semibold text-[#EDEEFF] text-sm truncate">{leaderboard.name}</p>
          {!hasPurchase && (
            <span className="text-[10px] font-semibold text-[#8A8FBF] bg-[#8A8FBF]/10 border border-[#8A8FBF]/20 px-2 py-0.5 rounded-full flex-shrink-0">
              No bids yet
            </span>
          )}
        </div>

        {subtitle && (
          <p className="text-[#8A8FBF] text-xs font-mono mb-1 truncate">{subtitle}</p>
        )}

        {leaderboard.topMessage && (
          <p className="text-[#8A8FBF] text-xs font-mono line-clamp-1 mb-2 italic">
            "{leaderboard.topMessage}"
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-[#8A8FBF]">
          <span className="text-[#7C9CFF] font-medium">{formatFunds(leaderboard.totalFunds)}</span>
          <span>·</span>
          <span>{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
        </div>
      </div>
    </div>
  )
}
