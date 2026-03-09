'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Github, Zap, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, ExternalLink, LogOut, ChevronRight as Arrow,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
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

interface GithubLeaderboard {
  address: string
  name: string
  totalFunds: string
  totalFundsRaw: string
  markeeCount: number
  admin: string
  minimumPrice: string
  topMessage: string | null
  topMessageOwner: string | null
}

interface GithubUser {
  connected: boolean
  uid?: string
  login?: string
  avatarUrl?: string
}

export default function GithubPlatformPage() {
  const { address: walletAddress } = useAccount()
  const [leaderboards, setLeaderboards] = useState<GithubLeaderboard[]>([])
  const [totalPlatformFunds, setTotalPlatformFunds] = useState('0')
  const [isLoadingLeaderboards, setIsLoadingLeaderboards] = useState(true)
  const [githubUser, setGithubUser] = useState<GithubUser>({ connected: false })
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const fetchGithubUser = useCallback(async () => {
    const res = await fetch('/api/github/me')
    if (res.ok) setGithubUser(await res.json())
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
      console.error(err)
    } finally {
      setIsLoadingLeaderboards(false)
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

  // Leaderboards where the connected wallet is admin
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
              { step: '1', title: 'Create a Markee', body: 'Deploy your sign onchain in seconds. Set a treasury address — 62% of every payment flows there automatically.' },
              { step: '2', title: 'Connect your repo', body: 'Authorize the Markee GitHub App to write to your markdown file and add the MARKEE delimiters.' },
              { step: '3', title: 'Earn on every bid', body: 'The sign updates automatically. Every AI agent that reads your repo sees the top message.' },
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

      {/* Top Markee Signs */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <Trophy size={20} className="text-[#F897FE]" />
            <h2 className="text-2xl font-bold text-[#EDEEFF]">Top Markee Signs</h2>
            <span className="text-[#8A8FBF] text-sm">ranked by total funds</span>
          </div>

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {leaderboards.map((lb, idx) => (
                <LeaderboardCard key={lb.address} leaderboard={lb} rank={idx + 1} formatFunds={formatFunds} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {createModalOpen && (
        <CreateMarkeeModal
          githubUser={githubUser}
          myLeaderboards={myLeaderboards}
          walletAddress={walletAddress}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={fetchLeaderboards}
          onGithubChange={fetchGithubUser}
        />
      )}
    </div>
  )
}

// ─── Leaderboard Card ─────────────────────────────────────────────────────────

function LeaderboardCard({
  leaderboard, rank, formatFunds,
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

  // name is stored as e.g. "my-org/my-repo — SKILL.md"
  // Split on em dash to show repo + file separately
  const [repoPart, filePart] = leaderboard.name.split(' — ')

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE]/40 transition-all overflow-hidden flex flex-col">
      <div className="p-5 border-b border-[#8A8FBF]/20 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Github size={13} className="text-[#8A8FBF] flex-shrink-0" />
            <span className="text-[#EDEEFF] font-semibold text-sm truncate">{repoPart ?? leaderboard.name}</span>
          </div>
          {filePart && (
            <span className="inline-block text-xs bg-[#7C9CFF]/15 border border-[#7C9CFF]/30 text-[#7C9CFF] px-2 py-0.5 rounded font-mono mt-1">
              {filePart}
            </span>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded border ${rankStyle}`}>
          #{rank}
        </span>
      </div>

      <div className="p-5 flex-1">
        {leaderboard.topMessage ? (
          <div>
            <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Top Message</div>
            <p className="text-[#EDEEFF] text-sm font-mono leading-relaxed line-clamp-3">{leaderboard.topMessage}</p>
            {leaderboard.topMessageOwner && (
              <p className="text-[#8A8FBF] text-xs mt-2 truncate">by {leaderboard.topMessageOwner}</p>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
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
          href={`/ecosystem/platforms/github/${leaderboard.address}`}
          className="block w-full text-center bg-[#F897FE]/10 border border-[#F897FE]/30 text-[#F897FE] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE]/20 transition-colors"
        >
          View Sign
        </Link>
      </div>
    </div>
  )
}

// ─── Create Markee Modal ──────────────────────────────────────────────────────
// View A: GitHub status + existing signs for this wallet
// View B: Create form

type ModalView = 'overview' | 'create'

function CreateMarkeeModal({
  githubUser,
  myLeaderboards,
  walletAddress,
  onClose,
  onSuccess,
  onGithubChange,
}: {
  githubUser: GithubUser
  myLeaderboards: GithubLeaderboard[]
  walletAddress?: string
  onClose: () => void
  onSuccess: () => void
  onGithubChange: () => void
}) {
  const router = useRouter()
  const [view, setView] = useState<ModalView>('overview')
  const [fileName, setFileName] = useState('')
  const [beneficiary, setBeneficiary] = useState(walletAddress ?? '')
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isConnected } = useAccount()

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess && receipt) {
      // Try to extract leaderboard address from factory logs
      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() === GITHUB_FACTORY_ADDRESS.toLowerCase() &&
          log.topics[1]
        ) {
          const addr = `0x${log.topics[1].slice(26)}`
          setNewLeaderboardAddress(addr)
          break
        }
      }
      onSuccess()
    }
  }, [isSuccess, receipt, onSuccess])

  const handleDisconnect = async () => {
    await fetch('/api/github/me', { method: 'DELETE' })
    onGithubChange()
  }

  const handleCreate = () => {
    setError(null)
    if (!fileName.trim()) { setError('Enter a file name.'); return }
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setError('Enter a valid Ethereum address.')
      return
    }
    // Name format: "repo — filename" if connected, otherwise just filename
    const leaderboardName = fileName.trim()
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
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors">
          <X size={20} />
        </button>

        {/* ── Success state ─────────────────────────────────────────── */}
        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">Markee created!</p>
            <p className="text-[#8A8FBF] text-sm text-center">
              Your sign is live on Base. Buy the first message to get it into context windows.
            </p>
            <div className="flex flex-col gap-3 w-full mt-2">
              <button
                onClick={() => newLeaderboardAddress && router.push(`/ecosystem/platforms/github/${newLeaderboardAddress}`)}
                className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
              >
                View your Markee →
              </button>
              {!githubUser.connected && (
                <a
                  href="/api/github/connect"
                  className="w-full flex items-center justify-center gap-2 text-[#8A8FBF] hover:text-[#EDEEFF] text-sm transition-colors border border-[#8A8FBF]/20 px-6 py-3 rounded-lg hover:border-[#8A8FBF]/40"
                >
                  <Github size={16} />
                  Connect a repo to auto-sync
                </a>
              )}
              <button onClick={onClose} className="text-[#8A8FBF] text-sm hover:text-[#EDEEFF] transition-colors text-center">
                Skip for now
              </button>
            </div>
          </div>

        /* ── Overview: GitHub status + existing signs ──────────────── */
        ) : view === 'overview' ? (
          <>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">Create a Markee</h2>

            {/* GitHub connection status */}
            <div className="mb-6">
              <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-3">GitHub Account</div>
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
                <div className="bg-[#060A2A] rounded-lg px-4 py-4 border border-[#8A8FBF]/15 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[#EDEEFF] text-sm mb-1">No repo connected</p>
                    <p className="text-[#8A8FBF] text-xs">Connect GitHub to auto-sync your markdown files.</p>
                  </div>
                  <a
                    href="/api/github/connect"
                    className="flex-shrink-0 flex items-center gap-1.5 bg-[#EDEEFF] text-[#060A2A] text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#F897FE] transition-colors whitespace-nowrap"
                  >
                    <Github size={13} />
                    Connect
                  </a>
                </div>
              )}
            </div>

            {/* Existing signs for this wallet */}
            {myLeaderboards.length > 0 && (
              <div className="mb-6">
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-3">Your Signs</div>
                <div className="space-y-2">
                  {myLeaderboards.map(lb => {
                    const [repoPart, filePart] = lb.name.split(' — ')
                    return (
                      <div key={lb.address} className="flex items-center justify-between bg-[#060A2A] rounded-lg px-4 py-3 border border-[#8A8FBF]/15">
                        <div className="min-w-0">
                          <p className="text-[#EDEEFF] text-sm truncate">{repoPart ?? lb.name}</p>
                          {filePart && (
                            <span className="text-xs text-[#7C9CFF] font-mono">{filePart}</span>
                          )}
                        </div>
                        <a
                          href={`/ecosystem/platforms/github/${lb.address}`}
                          className="flex-shrink-0 flex items-center gap-1 text-xs text-[#F897FE] hover:text-[#7C9CFF] transition-colors ml-4"
                        >
                          Manage
                          <Arrow size={13} />
                        </a>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Create new */}
            {!isConnected ? (
              <div className="space-y-3">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to create a Markee.</p>
                <ConnectButton />
              </div>
            ) : (
              <button
                onClick={() => setView('create')}
                className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
              >
                <Plus size={18} />
                Create a new Markee
              </button>
            )}
          </>

        /* ── Create form ──────────────────────────────────────────── */
        ) : (
          <>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#EDEEFF] text-sm mb-5 transition-colors"
            >
              ← Back
            </button>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">New Markee</h2>

            <div className="space-y-5">
              {/* File name */}
              <div>
                <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">File Name</label>
                <input
                  type="text"
                  value={fileName}
                  onChange={e => setFileName(e.target.value)}
                  placeholder="e.g. SKILL.md or README.md"
                  className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                />
                <p className="text-[#8A8FBF] text-xs mt-1.5">The markdown file this Markee will live in.</p>
              </div>

              {/* Treasury address */}
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
                <p className="text-[#8A8FBF] text-xs mt-1.5">
                  62% of every payment goes here. Use a multisig or your repo's Juicebox treasury.
                </p>
              </div>

              {/* Revenue split */}
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
                  <><Plus size={18} /> Create Markee</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
