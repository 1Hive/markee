'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Github, Zap, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, LogOut, ExternalLink, ShieldCheck, ShieldAlert, RefreshCw, Eye,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import type { LinkedFile } from './[address]/page'
import { useViews } from '@/hooks/useViews'
import type { Markee } from '@/types'

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

interface GithubLeaderboard {
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
  linkedFiles: LinkedFile[]
  repoVerified: boolean
  repoFullName: string | null
  repoOwner: string | null
  repoName: string | null
  repoAvatarUrl: string | null
  repoHtmlUrl: string | null
  filePath: string | null
}

interface GithubUser {
  connected: boolean
  uid?: string
  login?: string
  avatarUrl?: string
}

interface GithubRepo {
  id: number
  fullName: string
  name: string
  owner: string
  avatarUrl: string
  htmlUrl: string
  description: string | null
  private: boolean
}

export default function GithubPlatformPage() {
  const { address: walletAddress } = useAccount()
  const [leaderboards, setLeaderboards] = useState<GithubLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(true)
  const [githubUser, setGithubUser] = useState<GithubUser>({ connected: false })
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [createModalOpen, setCreateModalOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('modal') === 'create') {
      setCreateModalOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fetchRepos = useCallback(async () => {
    const res = await fetch('/api/github/my-repos')
    if (res.ok) {
      const data = await res.json()
      setRepos(data.repos ?? [])
    }
  }, [])

  const fetchGithubUser = useCallback(async () => {
    const res = await fetch('/api/github/me')
    if (res.ok) {
      const data = await res.json()
      setGithubUser(data)
      if (data.connected) fetchRepos()
    }
  }, [fetchRepos])

  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchLeaderboards = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoadingLeaderboards(true)
      else setIsRefreshing(true)
      const res = await fetch(`/api/github/leaderboards?t=${Date.now()}`, { cache: 'no-store' })
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
    fetchGithubUser()
    fetchLeaderboards()
  }, [fetchGithubUser, fetchLeaderboards])

  const formatFunds = (eth: string) => {
    const n = parseFloat(eth)
    if (n === 0) return '0 ETH'
    if (n < 0.001) return '< 0.001 ETH'
    return `${n.toFixed(4)} ETH`
  }

  const myLeaderboards = walletAddress
    ? leaderboards.filter(l => l.admin.toLowerCase() === walletAddress.toLowerCase())
    : []

  const liveLeaderboards = leaderboards.filter(l => l.linkedFiles.some(f => f.verified))
  const unliveLeaderboards = leaderboards.filter(l => !l.linkedFiles.some(f => f.verified))

  const viewableMarkees = useMemo(() => leaderboards.map(toMarkeeShape), [leaderboards])
  const { views } = useViews(viewableMarkees)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Ecosystem</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">GitHub</span>
          </div>
        </div>
      </section>

      <section className="relative py-20 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Github size={32} className="text-[#EDEEFF]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-[#EDEEFF] mb-2">Raise Funds on GitHub</h1>
                <p className="text-[#8A8FBF] max-w-xl">
                  Raise funds for your open source project by adding a Markee message to any markdown file in your repository.
                </p>
              </div>
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
            >
              <Plus size={18} />
              Create a Markee
            </button>
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

      <section className="py-12 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Connect GitHub & Create a Markee', body: 'Link your repo via OAuth so Markee can verify ownership, then deploy your sign onchain.' },
              { step: '2', title: 'Add Tags to a File', body: "Your sign's page shows the exact address-specific tags to drop into any markdown file. Place them anywhere you want the sponsored message to appear." },
              { step: '3', title: 'Start Earning', body: 'Buyers compete to set the message that everyone viewing your file will see - human or agent.' },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-sm font-bold">{step}</div>
                <div>
                  <h3 className="text-[#EDEEFF] font-semibold mb-1">{title}</h3>
                  <p className="text-[#8A8FBF] text-sm">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
              <Trophy size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No signs yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Be the first to create a Markee for your repo.</p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
              >
                <Plus size={18} />
                Create a Markee
              </button>
            </div>
          ) : (
            <div className="space-y-12">
              {liveLeaderboards.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <Trophy size={20} className="text-[#F897FE]" />
                    <h2 className="text-2xl font-bold text-[#EDEEFF]">Live Integrations</h2>
                    <span className="flex items-center gap-1.5 bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE] text-xs font-semibold px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F897FE] animate-pulse" />
                      Live
                    </span>
                    <span className="text-[#8A8FBF] text-sm">ranked by total funds</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {liveLeaderboards.map((lb, idx) => (
                      <LeaderboardCard key={lb.address} leaderboard={lb} rank={idx + 1} formatFunds={formatFunds} viewCount={views.get(lb.address.toLowerCase())?.totalViews} />
                    ))}
                  </div>
                </div>
              )}

              {unliveLeaderboards.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-2xl font-bold text-[#EDEEFF]">Awaiting Integration</h2>
                    <span className="bg-[#8A8FBF]/15 border border-[#8A8FBF]/30 text-[#8A8FBF] text-xs font-semibold px-3 py-1 rounded-full">
                      Setup Needed
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-80">
                    {unliveLeaderboards.map((lb, idx) => (
                      <LeaderboardCard key={lb.address} leaderboard={lb} rank={liveLeaderboards.length + idx + 1} formatFunds={formatFunds} viewCount={views.get(lb.address.toLowerCase())?.totalViews} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {createModalOpen && (
        <CreateMarkeeModal
          githubUser={githubUser}
          myLeaderboards={myLeaderboards}
          repos={repos}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={fetchLeaderboards}
          onGithubChange={() => { fetchGithubUser(); fetchRepos() }}
        />
      )}
    </div>
  )
}

// ─── Leaderboard Card ─────────────────────────────────────────────────────────

function toMarkeeShape(lb: GithubLeaderboard): Markee {
  return {
    address: lb.address,
    message: lb.topMessage ?? '',
    owner: lb.admin,
    totalFundsAdded: BigInt(lb.topFundsAddedRaw ?? '0'),
    chainId: 8453,
    pricingStrategy: '',
  }
}

const GITHUB_LOGO = 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
const MAX_FILES_SHOWN = 3

function LeaderboardCard({
  leaderboard, formatFunds, viewCount,
}: {
  leaderboard: GithubLeaderboard
  rank: number
  formatFunds: (eth: string) => string
  viewCount?: number
}) {
  const router = useRouter()

  const minIncrement = BigInt('1000000000000000')
  const minPriceRaw = BigInt(leaderboard.minimumPriceRaw ?? '0')
  const topFunds = BigInt(leaderboard.topFundsAddedRaw ?? '0')
  const rawBuyPrice = topFunds + minIncrement
  const buyPrice = rawBuyPrice > minPriceRaw ? rawBuyPrice : minPriceRaw
  const buyPriceFormatted = Number(buyPrice) / 1e18

  const primaryFile = leaderboard.linkedFiles.find(f => f.verified) ?? leaderboard.linkedFiles[0] ?? null
  const title = primaryFile?.repoName ?? leaderboard.name.split(' — ')[0]
  const avatarUrl = primaryFile?.repoAvatarUrl ?? GITHUB_LOGO
  const repoHtmlUrl = primaryFile?.repoHtmlUrl ?? null

  const liveFiles = leaderboard.linkedFiles.filter(f => f.verified)
  const awaitingFiles = leaderboard.linkedFiles.filter(f => !f.verified)
  const allFiles = [...liveFiles, ...awaitingFiles]
  const shownFiles = allFiles.slice(0, MAX_FILES_SHOWN)
  const overflowCount = allFiles.length - MAX_FILES_SHOWN

  const displayMessageCount = Math.max(0, leaderboard.markeeCount - 1)

  // ← Cache linkedFiles in sessionStorage before navigating so the detail
  //   page can render the correct verified state immediately, bypassing
  //   Vercel KV read-replica lag.
  const handleNavigate = () => {
    try {
      sessionStorage.setItem(
        `markee:linkedFiles:${leaderboard.address.toLowerCase()}`,
        JSON.stringify(leaderboard.linkedFiles)
      )
    } catch {}
    router.push(`/ecosystem/platforms/github/${leaderboard.address}`)
  }

  return (
    <div className="relative">
      {repoHtmlUrl ? (
        <a
          href={repoHtmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/60 hover:bg-[#F897FE]/5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-medium px-4 py-2 rounded-t-lg transition-all"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          {repoHtmlUrl.replace(/^https?:\/\//, '')}
        </a>
      ) : null}

      <div className={repoHtmlUrl ? 'rounded-t-none rounded-b-lg overflow-hidden border border-t-0 border-[#F897FE]/20' : ''}>
        <div
          onClick={handleNavigate}
          className={`bg-[#0A0F3D] p-6 border border-[#8A8FBF]/20 hover:border-[#F897FE] transition-colors cursor-pointer ${
            repoHtmlUrl ? 'rounded-t-none rounded-b-lg' : 'rounded-lg'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <img src={avatarUrl} alt={title} className="h-12 w-12 object-contain rounded-lg" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[#EDEEFF] text-lg truncate">{title}</h3>
              {allFiles.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {shownFiles.map(file => (
                    <div key={`${file.repoFullName}:${file.filePath}`} className="flex items-center gap-1.5">
                      {file.verified ? (
                        <ShieldCheck size={10} className="text-green-400 flex-shrink-0" />
                      ) : (
                        <ShieldAlert size={10} className="text-[#8A8FBF] flex-shrink-0" />
                      )}
                      <span className={`text-xs font-mono truncate ${file.verified ? 'text-[#7C9CFF]' : 'text-[#8A8FBF]'}`}>
                        {file.filePath}
                      </span>
                    </div>
                  ))}
                  {overflowCount > 0 && (
                    <span className="text-[#8A8FBF] text-xs">+{overflowCount} more</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {leaderboard.topMessage ? (
            <div className="bg-[#060A2A] rounded-lg p-4 mb-4 border border-[#8A8FBF]/20 hover:border-[#7C9CFF]/50 transition-colors flex flex-col min-h-[120px]">
              <p className="text-[#EDEEFF] font-mono text-sm break-words mb-2 flex-1">
                {leaderboard.topMessage}
              </p>
              {leaderboard.topMessageOwner && (
                <p className="text-[#8A8FBF] text-xs text-right mt-auto">- {leaderboard.topMessageOwner}</p>
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
            <div className="flex items-center gap-3 text-[#8A8FBF]">
              {viewCount !== undefined && (
                <span className="flex items-center gap-1">
                  <Eye size={12} className="opacity-60" />
                  <span>{viewCount.toLocaleString()}</span>
                </span>
              )}
              <span>
                {displayMessageCount} {displayMessageCount === 1 ? 'message' : 'messages'}
              </span>
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); handleNavigate() }}
            className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2 rounded-lg font-semibold text-center hover:bg-[#7C9CFF] transition-colors text-sm"
          >
            {buyPriceFormatted.toFixed(3)} ETH to change
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Markee Modal ──────────────────────────────────────────────────────

type ModalView = 'overview' | 'create'

function CreateMarkeeModal({
  githubUser, myLeaderboards, repos, onClose, onSuccess, onGithubChange,
}: {
  githubUser: GithubUser
  myLeaderboards: GithubLeaderboard[]
  repos: GithubRepo[]
  onClose: () => void
  onSuccess: () => void
  onGithubChange: () => void
}) {
  const router = useRouter()
  const [view, setView] = useState<ModalView>('overview')
  const [repoSearch, setRepoSearch] = useState('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null)
  const [beneficiary, setBeneficiary] = useState('')
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isConnected } = useAccount()

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !receipt) return

    let foundAddress: string | null = null
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === GITHUB_FACTORY_ADDRESS.toLowerCase() &&
        log.topics[1]
      ) {
        foundAddress = `0x${log.topics[1].slice(26)}`
        break
      }
    }

    setNewLeaderboardAddress(foundAddress)
    onSuccess()
  }, [isSuccess, receipt, onSuccess])

  const handleDisconnect = async () => {
    await fetch('/api/github/me', { method: 'DELETE' })
    onGithubChange()
  }

  const handleCreate = () => {
    setError(null)
    if (!selectedRepo) { setError('Select a repo.'); return }
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setError('Enter a valid Ethereum address.')
      return
    }
    writeContract({
      address: GITHUB_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [beneficiary as `0x${string}`, selectedRepo.fullName],
    })
  }

  const filteredRepos = repos.filter(r =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors">
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">Markee created!</p>
            <p className="text-[#8A8FBF] text-sm text-center">
              Your sign for <span className="text-[#EDEEFF] font-mono">{selectedRepo?.fullName}</span> is live. Add a file integration from the sign's page.
            </p>
            <div className="flex flex-col gap-3 w-full mt-2">
              <button
                onClick={() => newLeaderboardAddress && router.push(`/ecosystem/platforms/github/${newLeaderboardAddress}`)}
                className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
              >
                Set up integration →
              </button>
              <button onClick={onClose} className="text-[#8A8FBF] text-sm hover:text-[#EDEEFF] transition-colors text-center">
                Close
              </button>
            </div>
          </div>

        ) : view === 'overview' ? (
          <>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">Create a Markee</h2>

            <div className="mb-6">
              {githubUser.connected ? (
                <div className="flex items-center justify-between bg-[#060A2A] rounded-lg px-4 py-3 border border-[#8A8FBF]/15">
                  <div className="flex items-center gap-3">
                    {githubUser.avatarUrl && (
                      <img src={githubUser.avatarUrl} alt={githubUser.login} className="w-7 h-7 rounded-full" />
                    )}
                    <div>
                      <p className="text-[#EDEEFF] text-sm font-semibold">@{githubUser.login}</p>
                      <p className="text-[#8A8FBF] text-xs">Connected</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-red-400 transition-colors text-xs"
                  >
                    <LogOut size={13} />
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center gap-4 py-4">
                  <Github size={32} className="text-[#8A8FBF]" />
                  <p className="text-[#8A8FBF] text-sm leading-relaxed">
                    GitHub OAuth lets us verify your GitHub account and securely link your Markee to it.
                  </p>
                  <a
                    href="/api/github/connect?returnTo=modal"
                    className="flex items-center gap-2 bg-[#EDEEFF] text-[#060A2A] text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#F897FE] transition-colors"
                  >
                    <Github size={15} />
                    Connect GitHub
                  </a>
                </div>
              )}
            </div>

            {myLeaderboards.length > 0 && (
              <div className="mb-6">
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-3">Your Signs</div>
                <div className="space-y-2">
                  {myLeaderboards.map(lb => {
                    const live = lb.linkedFiles.filter(f => f.verified).length
                    const awaiting = lb.linkedFiles.filter(f => !f.verified).length
                    return (
                      <div key={lb.address} className="flex items-center justify-between bg-[#060A2A] rounded-lg px-4 py-3 border border-[#8A8FBF]/15">
                        <div className="min-w-0 flex-1">
                          <p className="text-[#EDEEFF] text-sm truncate">
                            {lb.repoFullName ?? lb.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {live > 0 && (
                              <span className="flex items-center gap-1 text-green-400 text-xs">
                                <ShieldCheck size={10} /> {live} live
                              </span>
                            )}
                            {awaiting > 0 && (
                              <span className="flex items-center gap-1 text-[#8A8FBF] text-xs">
                                <ShieldAlert size={10} /> {awaiting} awaiting
                              </span>
                            )}
                            {lb.linkedFiles.length === 0 && (
                              <span className="text-[#8A8FBF] text-xs">No files linked</span>
                            )}
                          </div>
                        </div>
                        <a
                          href={`/ecosystem/platforms/github/${lb.address}`}
                          className="flex-shrink-0 text-xs text-[#F897FE] hover:text-[#7C9CFF] transition-colors ml-4"
                        >
                          Manage →
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {githubUser.connected && (
              isConnected ? (
                <button
                  onClick={() => setView('create')}
                  className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
                >
                  Create a Markee
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-[#8A8FBF] text-sm">Connect your wallet to create a Markee.</p>
                  <ConnectButton />
                </div>
              )
            )}
          </>

        ) : (
          <>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#EDEEFF] text-sm mb-5 transition-colors"
            >
              ← Back
            </button>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-1">New Markee</h2>
            <p className="text-[#8A8FBF] text-xs mb-6">as @{githubUser.login}</p>

            <div className="space-y-5">
              <div className="relative">
                <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Repo</label>
                {selectedRepo ? (
                  <div className="flex items-center justify-between bg-[#060A2A] border border-[#F897FE]/40 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={selectedRepo.avatarUrl} alt={selectedRepo.owner} className="w-5 h-5 rounded-full flex-shrink-0" />
                      <span className="text-[#EDEEFF] text-sm font-mono truncate">{selectedRepo.fullName}</span>
                      {selectedRepo.private && <span className="text-[#8A8FBF] text-xs flex-shrink-0">private</span>}
                    </div>
                    <button
                      onClick={() => { setSelectedRepo(null); setRepoSearch('') }}
                      className="text-[#8A8FBF] hover:text-[#EDEEFF] ml-3 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={repoSearch}
                      onChange={e => { setRepoSearch(e.target.value); setRepoDropdownOpen(true) }}
                      onFocus={() => setRepoDropdownOpen(true)}
                      placeholder={repos.length ? 'Search your repos…' : 'Loading repos…'}
                      className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                    />
                    {repoDropdownOpen && filteredRepos.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                        {filteredRepos.slice(0, 20).map(r => (
                          <button
                            key={r.id}
                            onClick={() => { setSelectedRepo(r); setRepoSearch(''); setRepoDropdownOpen(false) }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F897FE]/10 transition-colors text-left"
                          >
                            <img src={r.avatarUrl} alt={r.owner} className="w-5 h-5 rounded-full flex-shrink-0" />
                            <span className="text-[#EDEEFF] text-sm font-mono truncate">{r.fullName}</span>
                            {r.private && <span className="text-[#8A8FBF] text-xs ml-auto flex-shrink-0">private</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[#8A8FBF] text-xs mt-1.5">Repos where you have push access, verified via GitHub.</p>
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
                  <><Loader2 size={18} className="animate-spin" /> {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}</>
                ) : (
                  'Create a Markee'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
