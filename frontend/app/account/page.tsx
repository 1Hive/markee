'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import {
  Globe2, Github, Zap, Trophy, User, ChevronRight, ExternalLink, Pencil, Code2, CheckCircle2,
  MessageSquare, TrendingUp, TrendingDown,
} from 'lucide-react'
import { EditWebsiteMetaModal } from '@/components/modals/EditWebsiteMetaModal'
import { IntegrationHealthStatus } from '@/components/IntegrationHealthStatus'
import { IntegrationModal } from '@/components/modals/IntegrationModal'
import { VerifyIntegrationModal } from '@/components/modals/VerifyIntegrationModal'
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
  topMessageOwner?: string | null
  topFundsAddedRaw: string
  minimumPriceRaw?: string
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

interface WebsiteLeaderboard extends BaseLeaderboard {
  platform: 'website'
  creator: string | null
  logoUrl: string | null
  siteUrl: string | null
  verifiedUrl: string | null
  verifiedUrls: string[]
  status: 'pending' | 'verified'
  isLegacy: boolean
  slug?: string
}

type AnyLeaderboard = SuperfluidLeaderboard | GithubLeaderboard | WebsiteLeaderboard

interface MyMessage {
  address: string
  message: string
  name: string
  totalFundsAdded: bigint
  createdAt: number
  strategyId: string
  strategyName: string
  isTop: boolean
  topFunds: bigint
}

const MY_MESSAGES_QUERY = `
  query GetMyMessages($owner: String!) {
    markees(
      where: { owner: $owner }
      orderBy: totalFundsAdded
      orderDirection: desc
      first: 50
    ) {
      id
      address
      message
      name
      totalFundsAdded
      createdAt
      strategy {
        id
        instanceName
        markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1) {
          address
          totalFundsAdded
        }
      }
      partnerStrategy {
        id
        instanceName
        markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1) {
          address
          totalFundsAdded
        }
      }
    }
  }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFunds(eth: string) {
  const n = parseFloat(eth)
  if (n === 0) return '0 ETH'
  if (n < 0.001) return '< 0.001 ETH'
  return `${n.toFixed(3)} ETH`
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function platformIcon(lb: AnyLeaderboard, size = 22) {
  if (lb.platform === 'superfluid') return <Zap size={size} className="text-[#1DB227]" />
  if (lb.platform === 'github') return <Github size={size} className="text-[#EDEEFF]" />
  return <Globe2 size={size} className="text-[#F897FE]" />
}

function platformLink(lb: AnyLeaderboard) {
  if (lb.platform === 'superfluid') return '/ecosystem/platforms/superfluid'
  if (lb.platform === 'github') return '/ecosystem/platforms/github'
  return '/ecosystem'
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { address: walletAddress, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)

  const [superfluidBoards, setSuperfluidBoards] = useState<SuperfluidLeaderboard[]>([])
  const [githubBoards, setGithubBoards] = useState<GithubLeaderboard[]>([])
  const [websiteBoards, setWebsiteBoards] = useState<WebsiteLeaderboard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [myMessages, setMyMessages] = useState<MyMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [editingBoard, setEditingBoard] = useState<WebsiteLeaderboard | null>(null)
  const [integrationBoard, setIntegrationBoard] = useState<WebsiteLeaderboard | null>(null)
  const [verifyBoard, setVerifyBoard] = useState<WebsiteLeaderboard | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const fetchAll = useCallback(async (addr: string) => {
    setIsLoading(true)
    try {
      const [sfRes, ghRes, oiRes] = await Promise.all([
        fetch('/api/superfluid/leaderboards?bust=1', { cache: 'no-store' }),
        fetch('/api/github/leaderboards?bust=1', { cache: 'no-store' }),
        fetch('/api/openinternet/leaderboards?bust=1', { cache: 'no-store' }),
      ])

      if (sfRes.ok) {
        const data = await sfRes.json()
        const mine = (data.leaderboards ?? [])
          .filter((lb: BaseLeaderboard & { creator?: string | null }) =>
            (lb.creator ?? lb.admin).toLowerCase() === addr.toLowerCase()
          )
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

      if (oiRes.ok) {
        const data = await oiRes.json()
        const mine = (data.leaderboards ?? [])
          .filter((lb: any) => {
            // Factory leaderboards: filter by creator
            // Legacy TopDawg: not shown on account page (no creator tracking)
            if (lb.isLegacy) return false
            const c = lb.creator ?? lb.admin
            return c && c.toLowerCase() === addr.toLowerCase()
          })
          .map((lb: any) => ({ ...lb, platform: 'website' as const }))
        setWebsiteBoards(mine)
      }
    } catch (err) {
      console.error('[account] fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchMyMessages = useCallback(async (addr: string) => {
    const subgraphUrl = `https://gateway.thegraph.com/api/${process.env.NEXT_PUBLIC_GRAPH_TOKEN}/subgraphs/id/8kMCKUHSY7o6sQbsvufeLVo8PifxrsnagjVTMGcs6KdF`
    if (!process.env.NEXT_PUBLIC_GRAPH_TOKEN) return
    setIsLoadingMessages(true)
    try {
      const res = await fetch(subgraphUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: MY_MESSAGES_QUERY,
          variables: { owner: addr.toLowerCase() },
        }),
      })
      if (!res.ok) return
      const { data } = await res.json()
      const raw = data?.markees ?? []
      const messages: MyMessage[] = raw.map((m: any) => {
        const strat = m.partnerStrategy ?? m.strategy
        const topMarkees: { address: string; totalFundsAdded: string }[] = strat?.markees ?? []
        const topFunds = topMarkees[0] ? BigInt(topMarkees[0].totalFundsAdded) : BigInt(0)
        const isTop = topMarkees.length === 0 || topMarkees[0]?.address?.toLowerCase() === m.address?.toLowerCase()
        return {
          address: m.address,
          message: m.message ?? '',
          name: m.name ?? '',
          totalFundsAdded: BigInt(m.totalFundsAdded ?? '0'),
          createdAt: Number(m.createdAt ?? 0),
          strategyId: strat?.id ?? '',
          strategyName: strat?.instanceName ?? 'Unknown Leaderboard',
          isTop,
          topFunds,
        }
      })
      setMyMessages(messages)
    } catch {
      // non-critical
    } finally {
      setIsLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (walletAddress) fetchAll(walletAddress)
  }, [walletAddress, fetchAll])

  useEffect(() => {
    if (walletAddress) fetchMyMessages(walletAddress)
  }, [walletAddress, fetchMyMessages])

  const allBoards: AnyLeaderboard[] = [
    ...superfluidBoards,
    ...githubBoards,
    ...websiteBoards,
  ].sort((a, b) => {
    const diff = BigInt(b.totalFundsRaw) - BigInt(a.totalFundsRaw)
    return diff > 0n ? 1 : diff < 0n ? -1 : 0
  })

  const awaitingVerification = allBoards.filter(lb =>
    lb.platform === 'website' &&
    BigInt(lb.topFundsAddedRaw ?? '0') > 0n &&
    ((lb as WebsiteLeaderboard).verifiedUrls?.length ?? 0) === 0
  ) as WebsiteLeaderboard[]
  const awaitingVerificationAddrs = new Set(awaitingVerification.map(lb => lb.address))
  const activeBoards = allBoards.filter(lb =>
    BigInt(lb.topFundsAddedRaw ?? '0') > 0n && !awaitingVerificationAddrs.has(lb.address)
  )
  const inactiveBoards = allBoards.filter(lb => BigInt(lb.topFundsAddedRaw ?? '0') === 0n)

  const totalRaisedWei = allBoards.reduce((sum, lb) => sum + BigInt(lb.totalFundsRaw), 0n)

  function detailUrl(lb: AnyLeaderboard) {
    if (lb.platform === 'superfluid') return `/ecosystem/platforms/superfluid/${lb.address}`
    if (lb.platform === 'github') return `/ecosystem/platforms/github/${lb.address}`
    return `/ecosystem/website/${lb.address}`
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

            {mounted && !isConnected && <ConnectButton />}
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
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {!mounted || isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-6 animate-pulse h-64" />
              ))}
            </div>
          ) : !isConnected ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-16 border border-[#8A8FBF]/20 text-center">
              <User size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">Connect your wallet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">See all the Markees you've created across every platform.</p>
              <ConnectButton />
            </div>
          ) : allBoards.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-16 border border-[#8A8FBF]/20 text-center">
              <User size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No Markees yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Create your first sign on one of our platforms.</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/ecosystem"
                  className="flex items-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/30 hover:border-[#F897FE]/60 text-[#EDEEFF] px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Globe2 size={14} className="text-[#F897FE]" />
                  Website
                </Link>
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
            <div className="space-y-12">
              {awaitingVerification.length > 0 && (
                <div className="bg-[#0A0F3D] rounded-2xl border border-[#F897FE]/30 p-6">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse flex-shrink-0" />
                    <h2 className="text-xl font-bold text-[#F897FE]">Awaiting Verification</h2>
                  </div>
                  <p className="text-[#8A8FBF] text-sm mb-6 ml-5">Verify your integration to appear in Top Verified Markees</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {awaitingVerification.map(lb => (
                      <AccountLeaderboardCard
                        key={lb.address}
                        leaderboard={lb}
                        detailUrl={detailUrl(lb)}
                        icon={platformIcon(lb)}
                        platformHref={platformLink(lb)}
                        variant="active"
                        onEdit={() => setEditingBoard(lb)}
                        onIntegrate={() => setIntegrationBoard(lb)}
                        onVerify={() => setVerifyBoard(lb)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {inactiveBoards.length > 0 && (
                <div className="bg-[#0A0F3D] rounded-2xl border border-[#7C9CFF]/30 p-6">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-2 h-2 rounded-full bg-[#7C9CFF] animate-pulse flex-shrink-0" />
                    <h2 className="text-xl font-bold text-[#7C9CFF]">Awaiting Activation</h2>
                  </div>
                  <p className="text-[#8A8FBF] text-sm mb-6 ml-5">Buy a message to activate these Markees</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inactiveBoards.map(lb => (
                      <AccountLeaderboardCard
                        key={lb.address}
                        leaderboard={lb}
                        detailUrl={detailUrl(lb)}
                        icon={platformIcon(lb)}
                        subtitle={lb.platform === 'github' ? (lb as GithubLeaderboard).repoFullName ?? undefined : undefined}
                        platformHref={platformLink(lb)}
                        variant="inactive"
                        onEdit={lb.platform === 'website' ? () => setEditingBoard(lb as WebsiteLeaderboard) : undefined}
                        onIntegrate={lb.platform === 'website' ? () => setIntegrationBoard(lb as WebsiteLeaderboard) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeBoards.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="w-2 h-2 rounded-full bg-[#1DB227]" />
                    <h2 className="text-xl font-bold text-[#EDEEFF]">Active Markees</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeBoards.map(lb => (
                      <AccountLeaderboardCard
                        key={lb.address}
                        leaderboard={lb}
                        detailUrl={detailUrl(lb)}
                        icon={platformIcon(lb)}
                        subtitle={lb.platform === 'github' ? (lb as GithubLeaderboard).repoFullName ?? undefined : undefined}
                        platformHref={platformLink(lb)}
                        variant="active"
                        onEdit={lb.platform === 'website' ? () => setEditingBoard(lb as WebsiteLeaderboard) : undefined}
                        onIntegrate={lb.platform === 'website' ? () => setIntegrationBoard(lb as WebsiteLeaderboard) : undefined}
                        onVerify={lb.platform === 'website' ? () => setVerifyBoard(lb as WebsiteLeaderboard) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Messages I've Bought */}
      {mounted && isConnected && (
        <section className="py-12 bg-[#0A0F3D] border-t border-[#8A8FBF]/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare size={20} className="text-[#7C9CFF]" />
              <h2 className="text-xl font-bold text-[#EDEEFF]">Messages I&apos;ve Bought</h2>
            </div>
            <p className="text-[#8A8FBF] text-sm mb-8 ml-8">
              Your messages posted on Markee leaderboards
            </p>

            {isLoadingMessages ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-[#060A2A] rounded-lg border border-[#8A8FBF]/20 p-5 animate-pulse h-44" />
                ))}
              </div>
            ) : myMessages.length === 0 ? (
              <div className="bg-[#060A2A] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
                <MessageSquare size={32} className="text-[#8A8FBF] mx-auto mb-3" />
                <p className="text-[#EDEEFF] font-semibold mb-1">No messages yet</p>
                <p className="text-[#8A8FBF] text-sm mb-5">
                  Buy a message on any Markee leaderboard to get your words in front of an audience.
                </p>
                <Link
                  href="/ecosystem"
                  className="inline-flex items-center gap-2 bg-[#7C9CFF] text-[#060A2A] px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#F897FE] transition-colors"
                >
                  Browse leaderboards
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myMessages.map(msg => (
                  <MessageCard key={msg.address} message={msg} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <Footer />

      {editingBoard && (
        <EditWebsiteMetaModal
          isOpen={!!editingBoard}
          onClose={() => setEditingBoard(null)}
          leaderboardAddress={editingBoard.address}
          initialSiteUrl={editingBoard.siteUrl}
          initialLogoUrl={editingBoard.logoUrl}
          onSuccess={() => { setEditingBoard(null); if (walletAddress) fetchAll(walletAddress) }}
        />
      )}

      {integrationBoard && (
        <IntegrationModal
          isOpen={!!integrationBoard}
          onClose={() => setIntegrationBoard(null)}
          leaderboard={{
            address: integrationBoard.address,
            name: integrationBoard.name,
            verifiedUrls: integrationBoard.verifiedUrls,
            status: integrationBoard.status,
          }}
          onOpenVerify={() => { setIntegrationBoard(null); setVerifyBoard(integrationBoard) }}
        />
      )}

      {verifyBoard && (
        <VerifyIntegrationModal
          isOpen={!!verifyBoard}
          onClose={() => setVerifyBoard(null)}
          leaderboard={{
            address: verifyBoard.address,
            name: verifyBoard.name,
            verifiedUrls: verifyBoard.verifiedUrls,
          }}
          onVerified={() => { if (walletAddress) fetchAll(walletAddress) }}
          onOpenIntegration={() => { setVerifyBoard(null); setIntegrationBoard(verifyBoard) }}
        />
      )}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AccountLeaderboardCard({
  leaderboard,
  detailUrl,
  icon,
  subtitle,
  platformHref,
  variant,
  onEdit,
  onIntegrate,
  onVerify,
}: {
  leaderboard: AnyLeaderboard
  detailUrl: string
  icon: React.ReactNode
  subtitle?: string
  platformHref: string
  variant: 'active' | 'inactive'
  onEdit?: () => void
  onIntegrate?: () => void
  onVerify?: () => void
}) {
  const router = useRouter()
  const messageCount = Math.max(0, leaderboard.markeeCount - 1)

  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const minPriceRaw = BigInt(leaderboard.minimumPriceRaw ?? '0')
  const topFunds = BigInt(leaderboard.topFundsAddedRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceEth = (Number(buyPrice) / 1e18).toFixed(3)

  const isInactive = variant === 'inactive'
  const cardBorder = isInactive
    ? 'border-[#7C9CFF]/25 hover:border-[#7C9CFF]/60'
    : 'border-[#8A8FBF]/20 hover:border-[#F897FE]'
  const btnClass = isInactive
    ? 'w-full bg-[#7C9CFF] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#F897FE] transition-colors text-sm'
    : 'w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm'

  return (
    <div
      onClick={() => router.push(detailUrl)}
      className={`bg-[#060A2A] p-6 rounded-lg border transition-colors cursor-pointer ${cardBorder}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#0A0F3D] border border-[#8A8FBF]/20 flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#EDEEFF] text-lg truncate">{leaderboard.name}</h3>
          <div className="flex items-center gap-1.5">
            <span className="text-[#8A8FBF] text-xs font-mono">
              {subtitle ?? `${leaderboard.address.slice(0, 8)}…${leaderboard.address.slice(-6)}`}
            </span>
            <Link
              href={platformHref}
              onClick={e => e.stopPropagation()}
              className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors flex-shrink-0"
            >
              <ExternalLink size={11} />
            </Link>
            {onEdit && (
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors flex-shrink-0"
                title="Edit website info"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {leaderboard.topMessage ? (
        <div className="bg-[#0A0F3D] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 flex flex-col min-h-[100px]">
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
        <div className="bg-[#0A0F3D] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 text-center min-h-[100px] flex flex-col items-center justify-center">
          <div className="text-3xl mb-2">🪧</div>
          <p className="text-[#8A8FBF] text-sm">Be the first to buy a message</p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs mb-4">
        <span className="text-[#7C9CFF] font-medium">{formatFunds(leaderboard.totalFunds)} total raised.</span>
        <span className="text-[#8A8FBF]">{messageCount} {messageCount === 1 ? 'message' : 'messages'}</span>
      </div>

      <button
        onClick={e => { e.stopPropagation(); router.push(detailUrl) }}
        className={btnClass}
      >
        {buyPriceEth} ETH to {messageCount === 0 ? 'buy first message' : 'change message'}
      </button>

      {(onIntegrate || onVerify) && (
        <div className="flex gap-2 mt-2">
          {onIntegrate && (
            <button
              onClick={e => { e.stopPropagation(); onIntegrate() }}
              className="flex-1 flex items-center justify-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs transition-colors"
            >
              <Code2 size={11} />
              Integration guide
            </button>
          )}
          {onVerify && (
            <button
              onClick={e => { e.stopPropagation(); onVerify() }}
              className="flex-1 flex items-center justify-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs transition-colors"
            >
              <CheckCircle2 size={11} />
              Verify
            </button>
          )}
        </div>
      )}

      {leaderboard.platform === 'website' &&
        (leaderboard as WebsiteLeaderboard).verifiedUrls?.length > 0 && (
          <div
            className="mt-3 pt-3 border-t border-[#8A8FBF]/10 space-y-2"
            onClick={e => e.stopPropagation()}
          >
            {(leaderboard as WebsiteLeaderboard).verifiedUrls.map(url => (
              <div key={url} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#8A8FBF] truncate">
                  {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </span>
                <IntegrationHealthStatus url={url} />
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ─── Message Card ──────────────────────────────────────────────────────────────

function MessageCard({ message }: { message: MyMessage }) {
  const router = useRouter()
  const fundsEth = (Number(message.totalFundsAdded) / 1e18).toFixed(3)
  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const toTopEth = message.isTop
    ? null
    : (Number(message.topFunds - message.totalFundsAdded + minIncrement) / 1e18).toFixed(3)

  const detailUrl = `/markee/${message.address}`

  return (
    <div
      onClick={() => router.push(detailUrl)}
      className="bg-[#060A2A] p-5 rounded-lg border border-[#8A8FBF]/20 hover:border-[#7C9CFF]/60 transition-colors cursor-pointer flex flex-col gap-3"
    >
      {/* Status + leaderboard */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/ecosystem/website/${message.strategyId}`}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors truncate"
        >
          <Globe2 size={11} />
          <span className="truncate">{message.strategyName}</span>
          <ExternalLink size={10} className="flex-shrink-0" />
        </Link>
        {message.isTop ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-[#FFD700] bg-[#FFD700]/10 px-2 py-0.5 rounded-full flex-shrink-0">
            <TrendingUp size={11} />
            Top
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-[#F3841E] bg-[#F3841E]/10 px-2 py-0.5 rounded-full flex-shrink-0">
            <TrendingDown size={11} />
            Overtaken
          </span>
        )}
      </div>

      {/* Message */}
      <div className="bg-[#0A0F3D] rounded-lg p-3 border border-[#8A8FBF]/15 flex-1">
        <p className="text-[#EDEEFF] font-mono text-sm break-words leading-snug line-clamp-3">
          {message.message || <span className="text-[#8A8FBF] italic">(no message)</span>}
        </p>
        {message.name && (
          <p className="text-[#8A8FBF] text-xs mt-2 text-right">
            {message.name.startsWith('0x') && message.name.length === 42
              ? `${message.name.slice(0, 6)}…${message.name.slice(-4)}`
              : message.name}
          </p>
        )}
      </div>

      {/* Funds + action row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          <Trophy size={11} className="text-[#7C9CFF]" />
          <span className="text-[#7C9CFF] font-semibold">{fundsEth} ETH</span>
          <span className="text-[#8A8FBF]">funded by you</span>
        </div>
        <Link
          href={detailUrl}
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors flex-shrink-0"
        >
          {toTopEth ? `+${toTopEth} ETH to top` : 'Add funds'}
          <ChevronRight size={12} />
        </Link>
      </div>
    </div>
  )
}
