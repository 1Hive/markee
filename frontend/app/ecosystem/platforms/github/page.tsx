'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, Github, GitFork, Star, ExternalLink, Zap, Trophy, Plus, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'

const GITHUB_FACTORY_ADDRESS = '0x9df259De9dF51143e27d062f3B84Ed8D9AaCc3aA' as const

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

// Shape of a leaderboard returned by /api/github/leaderboards
interface GithubLeaderboard {
  address: string
  name: string
  totalFunds: string
  markeeCount: number
  admin: string
  minimumPrice: string
  topMessage: string | null
  topMessageOwner: string | null
}

// Shape of a connected repo returned by /api/github/repos
interface GithubRepo {
  id: number
  owner: string
  repo: string
  fullName: string
  description: string | null
  stars: number
  forks: number
  avatarUrl: string
  contractAddress: string | null
  topMessage: string | null
  topBidder: string | null
  installedAt: string
}

export default function GithubPlatformPage() {
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [leaderboards, setLeaderboards] = useState<GithubLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoadingRepos, setIsLoadingRepos] = useState(true)
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)

  const fetchRepos = useCallback(async () => {
    try {
      setIsLoadingRepos(true)
      const res = await fetch('/api/github/repos')
      if (res.ok) {
        const data = await res.json()
        setRepos(data.repos ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch GitHub repos:', err)
    } finally {
      setIsLoadingRepos(false)
    }
  }, [])

  const fetchLeaderboards = useCallback(async () => {
    try {
      setIsLoadingLeaderboards(true)
      const res = await fetch('/api/github/leaderboards')
      if (res.ok) {
        const data = await res.json()
        setLeaderboards(data.leaderboards ?? [])
        setTotalPlatformFunds(data.totalPlatformFunds ?? '0')
      }
    } catch (err) {
      console.error('Failed to fetch leaderboards:', err)
    } finally {
      setIsLoadingLeaderboards(false)
    }
  }, [])

  useEffect(() => {
    fetchRepos()
    fetchLeaderboards()
  }, [fetchRepos, fetchLeaderboards])

  const handleConnect = () => {
    window.location.href = '/api/github/connect'
  }

  const liveRepos = repos.filter(r => !!r.contractAddress)
  const pendingRepos = repos.filter(r => !r.contractAddress)

  const formatFunds = (eth: string) => {
    const n = parseFloat(eth)
    if (n === 0) return '0 ETH'
    if (n < 0.001) return '< 0.001 ETH'
    return `${n.toFixed(4)} ETH`
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
            <Link href="/ecosystem/platforms" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Platforms</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">GitHub</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Github size={32} className="text-[#EDEEFF]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-[#EDEEFF] mb-2">GitHub — SKILL.md</h1>
                <p className="text-[#8A8FBF] max-w-xl">
                  Context window advertising for open source repos. Your SKILL.md gets read by every AI agent that touches your codebase.
                </p>
              </div>
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
            >
              <Plus size={18} />
              Create a Leaderboard
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-8 mt-10">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{leaderboards.length}</span>
              <span className="text-[#8A8FBF]">active leaderboards</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trophy size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">{formatFunds(totalPlatformFunds)}</span>
              <span className="text-[#8A8FBF]">total platform funds</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Zap size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">Agent-native</span>
              <span className="text-[#8A8FBF]">impressions</span>
            </div>
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
                title: 'Create a leaderboard',
                body: 'Deploy your leaderboard onchain. Set a treasury address — 62% of every payment flows there automatically.',
              },
              {
                step: '2',
                title: 'Connect your repo',
                body: 'Authorize the Markee GitHub App to write to your SKILL.md and add the MARKEE delimiters.',
                code: false,
              },
              {
                step: '3',
                title: 'Earn on every bid',
                body: 'The leaderboard updates your SKILL.md automatically. Every AI agent that reads your repo sees the top message.',
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-sm font-bold">
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

      {/* Top Leaderboards */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Trophy size={20} className="text-[#F897FE]" />
              <h2 className="text-2xl font-bold text-[#EDEEFF]">Top Leaderboards</h2>
              <span className="text-[#8A8FBF] text-sm">ranked by total funds</span>
            </div>
          </div>

          {isLoadingLeaderboards ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse h-48" />
              ))}
            </div>
          ) : leaderboards.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-10 border border-[#8A8FBF]/20 text-center">
              <Trophy size={36} className="text-[#8A8FBF] mx-auto mb-3" />
              <p className="text-[#EDEEFF] font-semibold mb-1">No leaderboards yet</p>
              <p className="text-[#8A8FBF] text-sm">Connect a repo to create the first one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {leaderboards.map((lb, idx) => (
                <LeaderboardCard key={lb.address} leaderboard={lb} rank={idx + 1} formatFunds={formatFunds} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Connected Repos */}
      <section className="py-16 bg-[#0A0F3D] border-t border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Github size={20} className="text-[#F897FE]" />
              <h2 className="text-2xl font-bold text-[#EDEEFF]">Your Repos</h2>
            </div>
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 text-sm text-[#8A8FBF] hover:text-[#F897FE] transition-colors border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-4 py-2 rounded-lg"
            >
              <Plus size={14} />
              Connect repo
            </button>
          </div>

          {isLoadingRepos ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#060A2A] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse h-48" />
              ))}
            </div>
          ) : repos.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-[#060A2A] rounded-2xl p-12 max-w-lg mx-auto border border-[#8A8FBF]/20">
                <Github size={48} className="text-[#8A8FBF] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#EDEEFF] mb-3">No repos connected yet</h3>
                <p className="text-[#8A8FBF] mb-6 text-sm">
                  Be the first to turn your SKILL.md into a live context window billboard.
                </p>
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors mx-auto"
                >
                  <Github size={18} />
                  Connect your repo
                </button>
              </div>
            </div>
          ) : (
            <>
              {liveRepos.length > 0 && (
                <div className="mb-12">
                  <div className="flex items-center gap-3 mb-5">
                    <h3 className="text-lg font-bold text-[#EDEEFF]">Live</h3>
                    <span className="flex items-center gap-1.5 bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE] text-xs font-semibold px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F897FE] animate-pulse" />
                      Live
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {liveRepos.map(repo => (
                      <RepoCard key={repo.id} repo={repo} />
                    ))}
                  </div>
                </div>
              )}

              {pendingRepos.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <h3 className="text-lg font-bold text-[#EDEEFF]">Needs Setup</h3>
                    <span className="bg-[#8A8FBF]/15 border border-[#8A8FBF]/30 text-[#8A8FBF] text-xs font-semibold px-3 py-1 rounded-full">
                      Create a leaderboard to go live
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {pendingRepos.map(repo => (
                      <RepoCard
                        key={repo.id}
                        repo={repo}
                        pending
                        onCreateLeaderboard={() => {
                          setSelectedRepo(repo)
                          setCreateModalOpen(true)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />

      {/* Create Leaderboard Modal */}
      {createModalOpen && (
        <CreateLeaderboardModal
          repo={selectedRepo ?? undefined}
          onClose={() => {
            setCreateModalOpen(false)
            setSelectedRepo(null)
          }}
          onSuccess={() => {
            fetchRepos()
            fetchLeaderboards()
          }}
        />
      )}
    </div>
  )
}

// ─── Leaderboard Card ───────────────────────────────────────────────────────

function LeaderboardCard({
  leaderboard,
  rank,
  formatFunds,
}: {
  leaderboard: GithubLeaderboard
  rank: number
  formatFunds: (eth: string) => string
}) {
  const rankColors: Record<number, string> = {
    1: 'text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10',
    2: 'text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10',
    3: 'text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10',
  }
  const rankStyle = rankColors[rank] ?? 'text-[#8A8FBF] border-[#8A8FBF]/30 bg-[#8A8FBF]/10'

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE]/40 transition-all overflow-hidden flex flex-col">
      <div className="p-5 border-b border-[#8A8FBF]/20 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[#EDEEFF] font-semibold text-sm truncate">{leaderboard.name}</h3>
          <p className="text-[#8A8FBF] text-xs mt-0.5 font-mono truncate">{leaderboard.address.slice(0, 6)}…{leaderboard.address.slice(-4)}</p>
        </div>
        <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded border ${rankStyle}`}>
          #{rank}
        </span>
      </div>

      <div className="p-5 flex-1">
        {leaderboard.topMessage ? (
          <div>
            <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Top Message</div>
            <p className="text-[#EDEEFF] text-sm font-mono leading-relaxed line-clamp-3">
              {leaderboard.topMessage}
            </p>
            {leaderboard.topMessageOwner && (
              <p className="text-[#8A8FBF] text-xs mt-2 truncate">by {leaderboard.topMessageOwner}</p>
            )}
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-[#8A8FBF] text-sm">No messages yet</p>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#8A8FBF]">{leaderboard.markeeCount} messages</span>
          <span className="text-[#F897FE] font-semibold">{formatFunds(leaderboard.totalFunds)}</span>
        </div>
        <Link
          href={`/ecosystem/platforms/github/leaderboard/${leaderboard.address}`}
          className="block w-full text-center bg-[#F897FE]/10 border border-[#F897FE]/30 text-[#F897FE] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE]/20 transition-colors"
        >
          View Leaderboard
        </Link>
      </div>
    </div>
  )
}

// ─── Repo Card ──────────────────────────────────────────────────────────────

function RepoCard({
  repo,
  pending = false,
  onCreateLeaderboard,
}: {
  repo: GithubRepo
  pending?: boolean
  onCreateLeaderboard?: () => void
}) {
  return (
    <div className={`bg-[#060A2A] rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE]/40 transition-all overflow-hidden ${pending ? 'opacity-75' : ''}`}>
      <div className="p-5 border-b border-[#8A8FBF]/20">
        <div className="flex items-center gap-3 mb-2">
          <img src={repo.avatarUrl} alt={repo.owner} className="w-7 h-7 rounded-full" />
          <a
            href={`https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#EDEEFF] font-semibold hover:text-[#F897FE] transition-colors text-sm"
          >
            {repo.fullName}
            <ExternalLink size={12} className="text-[#8A8FBF]" />
          </a>
        </div>
        {repo.description && (
          <p className="text-[#8A8FBF] text-xs line-clamp-2">{repo.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1 text-[#8A8FBF] text-xs">
            <Star size={11} /> {repo.stars.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 text-[#8A8FBF] text-xs">
            <GitFork size={11} /> {repo.forks.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="p-5">
        {pending ? (
          <div className="space-y-3">
            <p className="text-[#8A8FBF] text-xs">Create a leaderboard to start accepting messages in your SKILL.md.</p>
            <button
              onClick={onCreateLeaderboard}
              className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#7C9CFF] transition-colors"
            >
              <Plus size={14} />
              Create Leaderboard
            </button>
          </div>
        ) : repo.topMessage ? (
          <div>
            <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Top Message</div>
            <p className="text-[#EDEEFF] text-sm font-mono leading-relaxed line-clamp-3">{repo.topMessage}</p>
            {repo.topBidder && (
              <p className="text-[#8A8FBF] text-xs mt-2 truncate">by {repo.topBidder}</p>
            )}
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-[#8A8FBF] text-sm mb-3">No messages yet</p>
            <Link
              href={`/ecosystem/platforms/github/${repo.owner}/${repo.repo}`}
              className="text-[#F897FE] text-sm font-semibold hover:text-[#7C9CFF] transition-colors"
            >
              Be the first →
            </Link>
          </div>
        )}
      </div>

      {!pending && (
        <div className="px-5 pb-5">
          <Link
            href={`/ecosystem/platforms/github/${repo.owner}/${repo.repo}`}
            className="block w-full text-center bg-[#F897FE]/10 border border-[#F897FE]/30 text-[#F897FE] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE]/20 transition-colors"
          >
            View Leaderboard
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Create Leaderboard Modal ────────────────────────────────────────────────

function CreateLeaderboardModal({
  repo,
  onClose,
  onSuccess,
}: {
  repo?: GithubRepo
  onClose: () => void
  onSuccess: () => void
}) {
  const { address, isConnected } = useAccount()
  const [beneficiary, setBeneficiary] = useState(address ?? '')
  const [customName, setCustomName] = useState(repo ? `${repo.fullName} SKILL.md` : '')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      onSuccess()
    }
  }, [isSuccess, onSuccess])

  const leaderboardName = repo ? `${repo.fullName} SKILL.md` : customName

  const handleCreate = () => {
    setError(null)
    if (!leaderboardName.trim()) {
      setError('Enter a name for your leaderboard.')
      return
    }
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setError('Enter a valid Ethereum address for your repo treasury.')
      return
    }
    writeContract({
      address: GITHUB_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [beneficiary as `0x${string}`, leaderboardName],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center">
            <Plus size={18} className="text-[#F897FE]" />
          </div>
          <div>
            <h2 className="text-[#EDEEFF] font-bold text-lg">Create Leaderboard</h2>
            <p className="text-[#8A8FBF] text-xs">{repo ? repo.fullName : 'GitHub Markdown'}</p>
          </div>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={40} className="text-green-400" />
            <p className="text-[#EDEEFF] font-semibold text-lg">Leaderboard created!</p>
            <p className="text-[#8A8FBF] text-sm text-center">
              Your SKILL.md leaderboard is live on Base. Now connect your repo so Markee can write the top message automatically.
            </p>
            <button
              onClick={() => { window.location.href = '/api/github/connect' }}
              className="mt-2 flex items-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
            >
              <Github size={18} />
              Connect your repo on GitHub
            </button>
            <button
              onClick={onClose}
              className="text-[#8A8FBF] text-sm hover:text-[#EDEEFF] transition-colors"
            >
              Skip for now
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {/* Leaderboard name */}
              <div>
                <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Leaderboard Name</label>
                {repo ? (
                  <div className="bg-[#060A2A] border border-[#8A8FBF]/20 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono">
                    {leaderboardName}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="e.g. my-org/my-repo SKILL.md"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                  />
                )}
              </div>

              {/* Beneficiary address */}
              <div>
                <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                  Repo Treasury Address
                  <span className="ml-1 text-[#F897FE]">*</span>
                </label>
                <input
                  type="text"
                  value={beneficiary}
                  onChange={e => setBeneficiary(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                />
                <p className="text-[#8A8FBF] text-xs mt-2">
                  62% of every payment goes here. Use a multisig or your repo's Juicebox treasury.
                </p>
              </div>

              {/* Revenue info */}
              <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15">
                <div className="text-[#8A8FBF] text-xs mb-3 uppercase tracking-wider">Revenue split</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#EDEEFF]">Repo treasury</span>
                    <span className="text-[#F897FE] font-semibold">62%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#EDEEFF]">Markee Cooperative</span>
                    <span className="text-[#7C9CFF] font-semibold">38%</span>
                  </div>
                </div>
              </div>

              {(error || writeError) && (
                <div className="flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{error ?? writeError?.message}</span>
                </div>
              )}
            </div>

            <div className="mt-6">
              {!isConnected ? (
                <ConnectButton />
              ) : (
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
                    <>
                      <Plus size={18} />
                      Create Leaderboard
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
