'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import {
  Globe2, Github, Zap, User, ChevronRight, ExternalLink, Pencil, Code2, CheckCircle2,
  MessageSquare,
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
  topMessage: string | null
  topMessageOwner: string | null
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
          message
          name
        }
      }
      partnerStrategy {
        id
        instanceName
        markees(orderBy: totalFundsAdded, orderDirection: desc, first: 1) {
          address
          totalFundsAdded
          message
          name
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
  return '/create-a-markee'
}

function detailUrl(lb: AnyLeaderboard) {
  if (lb.platform === 'superfluid') return `/ecosystem/platforms/superfluid/${lb.address}`
  if (lb.platform === 'github') return `/ecosystem/platforms/github/${lb.address}`
  return `/ecosystem/website/${lb.address}`
}

function logoSrc(lb: AnyLeaderboard): string | null {
  if (lb.platform === 'website') return (lb as WebsiteLeaderboard).logoUrl
  if (lb.platform === 'github') return (lb as GithubLeaderboard).repoAvatarUrl
  return null
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
  const [activeTab, setActiveTab] = useState('markees')
  const [archivedAddrs, setArchivedAddrs] = useState<string[]>([])

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
        const topMarkees: { address: string; totalFundsAdded: string; message?: string; name?: string }[] = strat?.markees ?? []
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
          topMessage: topMarkees[0]?.message ?? null,
          topMessageOwner: topMarkees[0]?.name ?? null,
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

  // Merged "Awaiting Integration" = awaitingVerification + inactive, minus archived
  const awaitingIntegration = [...awaitingVerification, ...inactiveBoards].filter(
    lb => !archivedAddrs.includes(lb.address)
  )
  const archivedBoards = allBoards.filter(lb => archivedAddrs.includes(lb.address))

  const totalRaisedWei = allBoards.reduce((sum, lb) => sum + BigInt(lb.totalFundsRaw), 0n)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="home" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/create-a-markee" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
              Create a Markee
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
                <h1 className="text-2xl font-bold text-[#EDEEFF] mb-1">My dashboard</h1>
                {walletAddress ? (
                  <p className="text-[#8A8FBF] text-sm font-mono">{shortAddr(walletAddress)}</p>
                ) : (
                  <p className="text-[#8A8FBF] text-sm">Connect your wallet to view your signs</p>
                )}
              </div>
            </div>

            {mounted && !isConnected && <ConnectButton />}
          </div>

          {isConnected && (
            <div className="grid gap-[14px] mt-7" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {(() => {
                const totalRaisedDisplay = (() => {
                  const n = Number(totalRaisedWei) / 1e18
                  if (n === 0) return '0 ETH'
                  if (n < 0.001) return '< 0.001 ETH'
                  return `${n.toFixed(3)} ETH`
                })()
                const activeCount = activeBoards.length
                const messagesBoughtCount = myMessages.length
                const contributedDisplay = '0 ETH'
                return [
                  { n: totalRaisedDisplay, label: 'total raised', color: '#F897FE' },
                  { n: String(activeCount), label: 'active signs', color: '#1DB227' },
                  { n: String(messagesBoughtCount), label: 'messages bought', color: '#EDEEFF' },
                  { n: contributedDisplay, label: 'contributed', color: '#7C9CFF' },
                ].map((c, i) => (
                  <div key={i} className="bg-[rgba(10,15,61,0.5)] border border-[#8A8FBF]/20 rounded-[14px] p-[22px]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color, boxShadow: `0 0 12px ${c.color}` }} />
                      <span className="font-mono text-[24px] font-bold tracking-[-0.5px] leading-[1.1] whitespace-nowrap" style={{ color: c.color }}>{c.n}</span>
                    </div>
                    <div className="text-[#B8B6D9] text-[13px] font-semibold">{c.label}</div>
                  </div>
                ))
              })()}
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
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex gap-1 border-b border-[#8A8FBF]/20 overflow-x-auto mt-6">
                {[
                  { key: 'markees', label: 'My Markees', count: allBoards.length },
                  { key: 'bought', label: "Messages I've Bought", count: myMessages.length },
                  { key: 'funded', label: "Messages I've Funded", count: 0 },
                ].map(item => (
                  <button key={item.key} onClick={() => setActiveTab(item.key)}
                    className="bg-transparent border-none cursor-pointer px-[18px] py-[14px] whitespace-nowrap flex items-center gap-2"
                    style={{
                      color: activeTab === item.key ? '#EDEEFF' : '#8A8FBF',
                      fontWeight: activeTab === item.key ? 700 : 500,
                      fontSize: 15,
                      borderBottom: `2px solid ${activeTab === item.key ? '#F897FE' : 'transparent'}`,
                      marginBottom: -1,
                    }}>
                    {item.label}
                    <span className="font-mono text-[12px] px-2 rounded-full"
                      style={{ color: activeTab === item.key ? '#F897FE' : '#8A8FBF', background: activeTab === item.key ? 'rgba(248,151,254,0.12)' : 'rgba(138,143,191,0.12)' }}>
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tab: My Markees */}
              {activeTab === 'markees' && (
                allBoards.length === 0 ? (
                  <div className="bg-[#0A0F3D] rounded-2xl p-16 border border-[#8A8FBF]/20 text-center mt-7">
                    <User size={40} className="text-[#8A8FBF] mx-auto mb-4" />
                    <p className="text-[#EDEEFF] font-semibold mb-2">No Markees yet</p>
                    <p className="text-[#8A8FBF] text-sm mb-6">Create your first sign on one of our platforms.</p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      <Link
                        href="/create-a-markee"
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
                  <div className="space-y-12 mt-7">
                    {awaitingIntegration.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-[18px] font-bold" style={{ color: '#7C9CFF' }}>Awaiting Integration</h2>
                          <span className="font-mono text-[12px]" style={{ color: '#8A8FBF' }}>{awaitingIntegration.length}</span>
                        </div>
                        <p className="text-[#8A8FBF] text-[13px] mb-4">These signs are private until your integration is verified.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {awaitingIntegration.map(lb => (
                            <AccountLeaderboardCard
                              key={lb.address}
                              leaderboard={lb}
                              detailUrl={detailUrl(lb)}
                              icon={platformIcon(lb)}
                              subtitle={lb.platform === 'github' ? (lb as GithubLeaderboard).repoFullName ?? undefined : undefined}
                              platformHref={platformLink(lb)}
                              variant="inactive"
                              statusLabel="integration-needed"
                              onEdit={lb.platform === 'website' ? () => setEditingBoard(lb as WebsiteLeaderboard) : undefined}
                              onIntegrate={() => setIntegrationBoard(lb as WebsiteLeaderboard)}
                              onVerify={lb.platform === 'website' ? () => setVerifyBoard(lb as WebsiteLeaderboard) : undefined}
                              onArchive={() => setArchivedAddrs(prev => [...prev, lb.address])}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="w-2 h-2 rounded-full bg-[#1DB227]" />
                        <h2 className="text-[18px] font-bold text-[#EDEEFF]">Active Markees</h2>
                        <span className="font-mono text-[12px]" style={{ color: '#8A8FBF' }}>{activeBoards.length}</span>
                      </div>
                      {activeBoards.length === 0 ? (
                        <p className="text-[#8A8FBF] text-[14px]">No active signs yet — finish a draft above to go live.</p>
                      ) : (
                        <ActiveTable boards={activeBoards} />
                      )}
                    </div>

                    {archivedBoards.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <h2 className="text-[18px] font-bold" style={{ color: '#8A8FBF' }}>Archived</h2>
                          <span className="font-mono text-[12px]" style={{ color: '#8A8FBF' }}>{archivedBoards.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {archivedBoards.map(lb => (
                            <AccountLeaderboardCard
                              key={lb.address}
                              leaderboard={lb}
                              detailUrl={detailUrl(lb)}
                              icon={platformIcon(lb)}
                              subtitle={lb.platform === 'github' ? (lb as GithubLeaderboard).repoFullName ?? undefined : undefined}
                              platformHref={platformLink(lb)}
                              variant="inactive"
                              isArchived
                              onUnarchive={() => setArchivedAddrs(prev => prev.filter(a => a !== lb.address))}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Tab: Messages I've Bought */}
              {activeTab === 'bought' && (
                <div className="mt-7">
                  {isLoadingMessages ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 p-5 animate-pulse h-44" />
                      ))}
                    </div>
                  ) : myMessages.length === 0 ? (
                    <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
                      <MessageSquare size={32} className="text-[#8A8FBF] mx-auto mb-3" />
                      <p className="text-[#EDEEFF] font-semibold mb-1">No messages yet</p>
                      <p className="text-[#8A8FBF] text-sm mb-5">
                        Buy a message on any Markee leaderboard to get your words in front of an audience.
                      </p>
                      <Link
                        href="/create-a-markee"
                        className="inline-flex items-center gap-2 bg-[#7C9CFF] text-[#060A2A] px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#F897FE] transition-colors"
                      >
                        Browse leaderboards
                      </Link>
                    </div>
                  ) : (
                    <MessageSections items={myMessages} kind="bought" />
                  )}
                </div>
              )}

              {/* Tab: Messages I've Funded */}
              {activeTab === 'funded' && (
                <div className="bg-[rgba(10,15,61,0.4)] border border-dashed border-[#8A8FBF]/20 rounded-[16px] p-14 text-center mt-7">
                  <div className="text-[30px] mb-3">🤝</div>
                  <p className="m-0 mb-1.5 text-[#EDEEFF] font-bold text-[17px]">No contributions yet</p>
                  <p className="m-0 mb-5 text-[#8A8FBF] text-[14px] max-w-[42ch] mx-auto leading-[1.55]">Back a message you believe in by adding funds — help it climb and stay on top.</p>
                  <Link href="/ecosystem" className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] rounded-lg px-[26px] py-[14px] font-bold text-[15px] no-underline">Browse the Marketplace →</Link>
                </div>
              )}
            </>
          )}
        </div>
      </section>

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
  statusLabel,
  isArchived,
  onEdit,
  onIntegrate,
  onVerify,
  onArchive,
  onUnarchive,
}: {
  leaderboard: AnyLeaderboard
  detailUrl: string
  icon: React.ReactNode
  subtitle?: string
  platformHref: string
  variant: 'active' | 'inactive'
  statusLabel?: 'active' | 'integration-needed'
  isArchived?: boolean
  onEdit?: () => void
  onIntegrate?: () => void
  onVerify?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
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

  const statusPill = statusLabel === 'integration-needed' ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99,
      fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
      background: 'rgba(124,156,255,0.12)', border: '1px solid rgba(124,156,255,0.35)', color: '#7C9CFF',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C9CFF', flexShrink: 0 }} />
      Integration Needed
    </span>
  ) : statusLabel === 'active' ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99,
      fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
      background: 'rgba(29,178,39,0.12)', border: '1px solid rgba(29,178,39,0.4)', color: '#1DB227',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1DB227', flexShrink: 0 }} />
      Active
    </span>
  ) : null

  return (
    <div
      onClick={() => router.push(detailUrl)}
      className={`bg-[#060A2A] p-6 rounded-lg border transition-colors cursor-pointer ${cardBorder}`}
      style={{ opacity: isArchived ? 0.6 : 1 }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
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
        {isArchived ? (
          <span style={{
            fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 11, fontWeight: 600,
            letterSpacing: 0.5, color: '#8A8FBF', border: '1px solid rgba(138,143,191,0.2)',
            borderRadius: 99, padding: '4px 10px', flexShrink: 0,
          }}>Archived</span>
        ) : statusPill ? (
          <div className="flex-shrink-0">{statusPill}</div>
        ) : null}
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

      {isArchived ? (
        <button
          onClick={e => { e.stopPropagation(); onUnarchive?.() }}
          style={{
            width: '100%', background: 'transparent', color: '#B8B6D9',
            border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8, padding: '11px',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >
          Unarchive
        </button>
      ) : isInactive ? (
        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); onIntegrate?.() }}
            style={{
              flex: 1, background: '#7C9CFF', color: '#060A2A', border: 'none',
              borderRadius: 8, padding: '11px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            Finish Setup
          </button>
          <button
            onClick={e => { e.stopPropagation(); onArchive?.() }}
            style={{
              flexShrink: 0, background: 'transparent', color: '#8A8FBF',
              border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8, padding: '11px 14px',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            Archive
          </button>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); router.push(detailUrl) }}
          className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
        >
          {buyPriceEth} ETH to {messageCount === 0 ? 'buy first message' : 'change message'}
        </button>
      )}

      {!isArchived && !isInactive && onVerify && (
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
          <button
            onClick={e => { e.stopPropagation(); onVerify() }}
            className="flex-1 flex items-center justify-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs transition-colors"
          >
            <CheckCircle2 size={11} />
            Verify
          </button>
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

// ─── Active Table ─────────────────────────────────────────────────────────────

function ActiveTable({ boards }: { boards: AnyLeaderboard[] }) {
  const cols = '200px 110px 1fr 80px 116px'

  function servedOnLabel(lb: AnyLeaderboard): string {
    if (lb.platform === 'website') {
      const site = (lb as WebsiteLeaderboard).verifiedUrl ?? (lb as WebsiteLeaderboard).siteUrl
      return site ? site.replace(/^https?:\/\//, '').replace(/\/$/, '') : lb.name
    }
    if (lb.platform === 'github') return (lb as GithubLeaderboard).repoFullName ?? lb.name
    return lb.name
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(138,143,191,0.2)' }}>
      <div style={{ minWidth: 680, background: '#0A0F3D' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: 16,
          padding: '11px 16px', borderBottom: '1px solid rgba(138,143,191,0.2)',
          background: '#060A2A', alignItems: 'center',
        }}>
          {['Served on', 'Total raised', 'Current Message', 'Views', 'Manage'].map((h, i) => (
            <span key={h} style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10, fontWeight: 600,
              letterSpacing: 1, textTransform: 'uppercase' as const, color: '#8A8FBF',
              textAlign: (i === 4 ? 'right' : 'left') as 'right' | 'left',
            }}>{h}</span>
          ))}
        </div>
        {/* Rows */}
        {boards.map(lb => {
          const logo = logoSrc(lb)
          return (
            <div key={lb.address} style={{
              display: 'grid', gridTemplateColumns: cols, gap: 16,
              padding: '13px 16px', borderBottom: '1px solid rgba(138,143,191,0.2)', alignItems: 'center',
            }}>
              {/* Served on */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#060A2A', border: '1px solid rgba(138,143,191,0.2)',
                }}>
                  {logo
                    ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : platformIcon(lb, 13)
                  }
                </span>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 12.5, color: '#EDEEFF',
                }}>{servedOnLabel(lb)}</span>
              </span>
              {/* Total raised */}
              <span style={{ fontSize: 12.5, color: '#7C9CFF', fontFamily: 'var(--font-jetbrains-mono, monospace)', fontWeight: 600 }}>
                {formatFunds(lb.totalFunds)}
              </span>
              {/* Current message */}
              <span style={{
                fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 13, color: '#EDEEFF',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {lb.topMessage || '-'}
              </span>
              {/* Views */}
              <span style={{ fontSize: 12, color: '#8A8FBF', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>-</span>
              {/* Manage */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ManageLink href={detailUrl(lb)}>Manage</ManageLink>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ManageLink({ href, children }: { href: string, children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'transparent',
        color: hovered ? '#EDEEFF' : '#B8B6D9',
        border: hovered ? '1px solid rgba(248,151,254,0.35)' : '1px solid rgba(138,143,191,0.2)',
        borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap' as const,
        textDecoration: 'none', display: 'inline-block',
        transition: 'border-color 140ms, color 140ms',
      }}
    >
      {children}
    </a>
  )
}

// ─── Message Card + Sections ───────────────────────────────────────────────────

function MessageCard({ message, kind }: { message: MyMessage, kind: 'bought' | 'funded' }) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const fundsEth = (Number(message.totalFundsAdded) / 1e18).toFixed(3)
  const minIncrement = BigInt('1000000000000000') // 0.001 ETH
  const toTopEth = message.isTop
    ? null
    : (Number(message.topFunds - message.totalFundsAdded + minIncrement) / 1e18).toFixed(3)

  const detailUrl = `/markee/${message.address}`
  const isBought = kind === 'bought'

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 10,
    letterSpacing: 1, textTransform: 'uppercase', color: '#8A8FBF', marginBottom: 6,
  }

  return (
    <div
      onClick={() => router.push(detailUrl)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#060A2A', borderRadius: 14, padding: 20,
        border: hovered ? '1px solid rgba(248,151,254,0.35)' : '1px solid rgba(138,143,191,0.2)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12,
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'border-color 140ms, transform 140ms',
      }}
    >
      {/* Header: leaderboard name + rank badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: '#8A8FBF', fontSize: 12,
          fontFamily: 'var(--font-jetbrains-mono, monospace)', minWidth: 0,
        }}>
          <Globe2 size={13} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#B8B6D9' }}>
            {message.strategyName}
          </span>
        </span>
        {message.isTop ? (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
            color: '#FFD45E', background: 'rgba(255,212,94,0.12)', padding: '3px 9px',
            borderRadius: 99, flexShrink: 0,
          }}>★ #1</span>
        ) : (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
            color: '#B8B6D9', background: 'rgba(138,143,191,0.16)', padding: '3px 9px',
            borderRadius: 99, flexShrink: 0,
          }}>Overtaken</span>
        )}
      </div>

      {/* "Now #1" box — only when overtaken and topMessage exists */}
      {!message.isTop && message.topMessage && (
        <div style={{
          background: '#0A0F3D', border: '1px solid rgba(138,143,191,0.2)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={labelStyle}>Now #1</div>
          <p style={{ margin: 0, color: '#B8B6D9', fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 13, lineHeight: 1.5 }}>
            {message.topMessage}
          </p>
          {message.topMessageOwner && (
            <p style={{ margin: '6px 0 0', color: '#8A8FBF', fontSize: 12, textAlign: 'right' }}>
              - {message.topMessageOwner}
            </p>
          )}
        </div>
      )}

      {/* Your message box */}
      <div style={{
        background: '#0A0F3D',
        border: message.isTop ? '1px solid rgba(138,143,191,0.2)' : '1px solid rgba(248,151,254,0.25)',
        borderRadius: 10, padding: '12px 14px', flex: 1,
      }}>
        <div style={labelStyle}>{isBought ? 'Your message' : 'You back'}</div>
        <p style={{ margin: 0, color: '#EDEEFF', fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 13, lineHeight: 1.5 }}>
          {message.message || <span style={{ color: '#8A8FBF', fontStyle: 'italic' }}>(no message)</span>}
        </p>
        {!isBought && message.name && (
          <p style={{ margin: '8px 0 0', color: '#8A8FBF', fontSize: 12, textAlign: 'right' }}>
            - {message.name}
          </p>
        )}
      </div>

      {/* Funds line */}
      <div style={{ fontSize: 12, color: '#7C9CFF', fontWeight: 600, fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
        {fundsEth} ETH{' '}
        <span style={{ color: '#8A8FBF', fontWeight: 400 }}>
          {isBought ? 'spent by you' : 'backed by you'}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isBought && (
          <button
            onClick={e => { e.stopPropagation(); router.push(detailUrl) }}
            style={{
              flexShrink: 0, background: 'transparent', color: '#B8B6D9',
              border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8,
              padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', lineHeight: 1.2,
            }}
          >
            Edit Message
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); router.push(detailUrl) }}
          style={{
            flex: 1, background: '#F897FE', color: '#060A2A', border: 'none',
            borderRadius: 8, padding: '11px 16px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.2,
            boxShadow: '0 4px 18px rgba(248,151,254,0.28)',
          }}
        >
          {message.isTop ? 'Add funds' : `Overtake for ${toTopEth} ETH`}
        </button>
      </div>
    </div>
  )
}

function MessageSections({ items, kind }: { items: MyMessage[], kind: 'bought' | 'funded' }) {
  const featured = items.filter(m => m.isTop)
  const needs = items.filter(m => !m.isTop)

  const SectionHead = ({ label, count, color }: { label: string, count: number, color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color }}>{label}</h2>
      <span style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', fontSize: 12, color: '#8A8FBF' }}>{count}</span>
    </div>
  )

  const Grid = ({ arr }: { arr: MyMessage[] }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
      {arr.map(m => <MessageCard key={m.address} message={m} kind={kind} />)}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      {featured.length > 0 && (
        <div>
          <SectionHead label="Featured Spots Owned" count={featured.length} color="#EDEEFF" />
          <Grid arr={featured} />
        </div>
      )}
      {needs.length > 0 && (
        <div>
          <SectionHead label="More Funds Needed" count={needs.length} color="#7C9CFF" />
          <Grid arr={needs} />
        </div>
      )}
    </div>
  )
}
