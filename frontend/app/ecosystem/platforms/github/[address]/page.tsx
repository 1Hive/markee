'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Github, Trophy, Plus, Zap, Copy, Check, Loader2, X,
  ShieldCheck, ShieldAlert, RefreshCw, Trash2, ExternalLink, Eye,
} from 'lucide-react'
import {
  useReadContracts, useAccount,
} from 'wagmi'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal, type MarkeeSlot } from '@/components/modals/BuyMessageModal'
import { useGithubTraffic } from '@/hooks/useGithubTraffic'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinkedFile {
  repoFullName: string
  repoOwner: string
  repoName: string
  repoAvatarUrl: string
  repoHtmlUrl: string
  filePath: string
  verified: boolean
  linkedAt: string
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLeaderboardFunds', outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxMessageLength', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GithubLeaderboardPage() {
  const params = useParams()
  const leaderboardAddress = (params.address as string) as `0x${string}`

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<MarkeeSlot | null>(null)
  const [initialMode, setInitialMode] = useState<'create' | 'addFunds' | 'updateMessage' | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [githubUser, setGithubUser] = useState<{ login: string; avatarUrl: string } | null>(null)
  const [githubLoading, setGithubLoading] = useState(true)
  const [linkedFiles, setLinkedFiles] = useState<LinkedFile[]>([])
  const [linkedFilesLoading, setLinkedFilesLoading] = useState(true)
  const [repos, setRepos] = useState<Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>>([])

  const { traffic, status: trafficStatus, errorMessage: trafficError, refresh: refreshTraffic } = useGithubTraffic(leaderboardAddress)

  const fetchLinkedFiles = useCallback(async () => {
    setLinkedFilesLoading(true)
    try {
      const res = await fetch(`/api/github/repo-status?address=${leaderboardAddress}`)
      const data = await res.json()
      setLinkedFiles(data.linkedFiles ?? [])
    } catch {
      setLinkedFiles([])
    } finally {
      setLinkedFilesLoading(false)
    }
  }, [leaderboardAddress])

  useEffect(() => {
    fetch('/api/github/me')
      .then(r => r.json())
      .then(data => {
        setGithubUser(data.connected ? { login: data.login, avatarUrl: data.avatarUrl } : null)
        if (data.connected) {
          fetch('/api/github/my-repos')
            .then(r => r.json())
            .then(d => setRepos(d.repos ?? []))
            .catch(() => {})
        }
      })
      .catch(() => setGithubUser(null))
      .finally(() => setGithubLoading(false))

    fetchLinkedFiles()
  }, [fetchLinkedFiles])

  // ── Read leaderboard metadata ──────────────────────────────────────────────
  const { data: meta, refetch: refetchMeta } = useReadContracts({
    contracts: [
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'leaderboardName' },
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'totalLeaderboardFunds' },
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'markeeCount' },
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'minimumPrice' },
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'admin' },
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'maxMessageLength' },
      { address: leaderboardAddress, abi: LEADERBOARD_ABI, functionName: 'getTopMarkees', args: [100n] },
    ],
  })

  const leaderboardName = meta?.[0]?.result as string | undefined
  const totalFunds = meta?.[1]?.result as bigint | undefined
  const minimumPrice = meta?.[3]?.result as bigint | undefined
  const maxMessageLength = meta?.[5]?.result as bigint | undefined
  const topResult = meta?.[6]?.result as [string[], bigint[]] | undefined

  // Strip " — filename" suffix from leaderboard name — only show repo name
  const displayName = leaderboardName ? leaderboardName.split(' — ')[0] : undefined

  const topAddresses = topResult?.[0] ?? []
  const topFunds = topResult?.[1] ?? []

  const { data: markeeDetails, refetch: refetchDetails } = useReadContracts({
    contracts: topAddresses.flatMap(addr => [
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'message' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'name' as const },
      { address: addr as `0x${string}`, abi: MARKEE_ABI, functionName: 'owner' as const },
    ]),
    query: { enabled: topAddresses.length > 0 },
  })

  const markees: MarkeeSlot[] = topAddresses
    .map((addr, i) => ({
      address: addr,
      message: (markeeDetails?.[i * 3]?.result as string) ?? '',
      name: (markeeDetails?.[i * 3 + 1]?.result as string) ?? '',
      owner: (markeeDetails?.[i * 3 + 2]?.result as string) ?? '',
      totalFundsAdded: topFunds[i] ?? 0n,
    }))
    .filter(m => m.totalFundsAdded > 0n)

  const refetch = useCallback(() => {
    refetchMeta()
    refetchDetails()
  }, [refetchMeta, refetchDetails])

  const handlePurchaseSuccess = useCallback(() => {
    refetch()
    setTimeout(() => {
      fetch('/api/github/update-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress }),
      }).catch(err => console.error('[update-markee-file] failed:', err))
    }, 5000)
  }, [leaderboardAddress, refetch])

  const formatFunds = (wei: bigint) => {
    const eth = parseFloat(formatEther(wei))
    if (eth === 0) return '0 ETH'
    if (eth < 0.0001) return '< 0.0001 ETH'
    return `${eth.toFixed(4)} ETH`
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(leaderboardAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const topMarkee = markees[0]
  const liveFiles = linkedFiles.filter(f => f.verified)

  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">Ecosystem</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <Link href="/ecosystem/platforms/github" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">GitHub</Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF] truncate max-w-xs">{displayName ?? 'Loading…'}</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-16 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Github size={28} className="text-[#EDEEFF]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#EDEEFF] mb-1">
                  {displayName ?? <span className="opacity-40">Loading…</span>}
                </h1>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-[#8A8FBF] hover:text-[#F897FE] text-xs font-mono transition-colors"
                >
                  {leaderboardAddress.slice(0, 8)}…{leaderboardAddress.slice(-6)}
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>

            <button
              onClick={() => { setSelectedMarkee(null); setBuyModalOpen(true) }}
              className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
            >
              <Plus size={18} />
              Buy a Message
            </button>
          </div>

          {/* Stats — use markees.length to exclude seed markee from count */}
          <div className="flex flex-wrap items-center gap-8 mt-8">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{markees.length}</span>
              <span className="text-[#8A8FBF]">messages</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Trophy size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">
                {totalFunds !== undefined ? formatFunds(totalFunds) : '—'}
              </span>
              <span className="text-[#8A8FBF]">total funded</span>
            </div>
            {minimumPrice !== undefined && minimumPrice > 0n && (
              <div className="flex items-center gap-2 text-sm">
                <Zap size={14} className="text-[#8A8FBF]" />
                <span className="text-[#8A8FBF]">min {formatFunds(minimumPrice)}</span>
              </div>
            )}
            {liveFiles.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck size={14} className="text-green-400" />
                <span className="text-green-400 font-semibold">{liveFiles.length}</span>
                <span className="text-[#8A8FBF]">live {liveFiles.length === 1 ? 'integration' : 'integrations'}</span>
              </div>
            )}
            {trafficStatus === 'success' && traffic && (
              <div className="flex items-center gap-2 text-sm">
                <Eye size={14} className="text-[#8A8FBF]" />
                <span className="text-[#EDEEFF] font-semibold">{traffic.count.toLocaleString()}</span>
                <span className="text-[#8A8FBF]">GitHub views</span>
                <span className="text-[#8A8FBF]/50">·</span>
                <span className="text-[#EDEEFF] font-semibold">{traffic.uniques.toLocaleString()}</span>
                <span className="text-[#8A8FBF]">unique</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top message spotlight */}
      {topMarkee && (
        <section className="bg-[#0A0F3D] border-y border-[#8A8FBF]/20 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#FFD700]/15 border border-[#FFD700]/40 text-[#FFD700] text-xs font-bold">
                #1
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">Top Message — In Context Window</div>
                <p className="text-[#EDEEFF] font-mono text-base leading-relaxed">
                  {topMarkee.message || <span className="opacity-40 italic">No message set</span>}
                </p>
                <div className="flex items-center gap-4 mt-3">
                  {topMarkee.name && (
                    <span className="text-[#8A8FBF] text-xs">by {topMarkee.name}</span>
                  )}
                  <span className="text-[#F897FE] text-xs font-semibold">{formatFunds(topMarkee.totalFundsAdded)}</span>
                  <button
                    onClick={() => { setSelectedMarkee(topMarkee); setBuyModalOpen(true) }}
                    className="text-[#7C9CFF] text-xs hover:text-[#F897FE] transition-colors"
                  >
                    Add funds →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="py-12 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[#EDEEFF]">All Messages</h2>
            <button
              onClick={() => { setSelectedMarkee(null); setBuyModalOpen(true) }}
              className="flex items-center gap-1.5 text-sm text-[#8A8FBF] hover:text-[#F897FE] transition-colors border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-4 py-2 rounded-lg"
            >
              <Plus size={14} />
              Buy a message
            </button>
          </div>

          {markees.length === 0 ? (
            <div className="bg-[#0A0F3D] rounded-2xl p-12 border border-[#8A8FBF]/20 text-center">
              <Trophy size={40} className="text-[#8A8FBF] mx-auto mb-4" />
              <p className="text-[#EDEEFF] font-semibold mb-2">No messages yet</p>
              <p className="text-[#8A8FBF] text-sm mb-6">Be the first to buy a message on this leaderboard.</p>
              <button
                onClick={() => setBuyModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors"
              >
                <Plus size={18} />
                Buy the first message
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {markees.map((markee, idx) => (
                <MarkeeRow
                  key={markee.address}
                  markee={markee}
                  rank={idx + 1}
                  formatFunds={formatFunds}
                  onAddFunds={() => { setSelectedMarkee(markee); setInitialMode('addFunds'); setBuyModalOpen(true) }}
                  onEditMessage={() => { setSelectedMarkee(markee); setInitialMode('updateMessage'); setBuyModalOpen(true) }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* GitHub integrations section */}
      <section className="py-12 bg-[#0A0F3D] border-t border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <IntegrationsSection
            leaderboardAddress={leaderboardAddress}
            githubUser={githubUser}
            githubLoading={githubLoading}
            linkedFiles={linkedFiles}
            linkedFilesLoading={linkedFilesLoading}
            repos={repos}
            onFilesUpdated={setLinkedFiles}
            traffic={traffic}
            trafficStatus={trafficStatus}
            trafficError={trafficError}
            refreshTraffic={refreshTraffic}
          />
        </div>
      </section>

      <Footer />

      {buyModalOpen && (
        <BuyMessageModal
          leaderboardAddress={leaderboardAddress}
          minimumPrice={minimumPrice ?? 0n}
          maxMessageLength={Number(maxMessageLength ?? 222n)}
          existingMarkee={selectedMarkee}
          topFundsAdded={markees[0]?.totalFundsAdded}
          initialMode={initialMode}
          onClose={() => { setBuyModalOpen(false); setSelectedMarkee(null); setInitialMode(undefined) }}
          onSuccess={handlePurchaseSuccess}
        />
      )}
    </div>
  )
}

// ─── Markee Row ───────────────────────────────────────────────────────────────

function MarkeeRow({
  markee, rank, formatFunds, onAddFunds, onEditMessage,
}: {
  markee: MarkeeSlot
  rank: number
  formatFunds: (wei: bigint) => string
  onAddFunds: () => void
  onEditMessage: () => void
}) {
  const { address } = useAccount()
  const isOwner = address && markee.owner.toLowerCase() === address.toLowerCase()

  const rankColors: Record<number, string> = {
    1: 'text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10',
    2: 'text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10',
    3: 'text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10',
  }
  const rankStyle = rankColors[rank] ?? 'text-[#8A8FBF] border-[#8A8FBF]/20 bg-[#8A8FBF]/5'

  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-all px-5 py-4 flex items-start gap-4">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${rankStyle}`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#EDEEFF] font-mono text-sm leading-relaxed line-clamp-2">
          {markee.message || <span className="opacity-40 italic">No message</span>}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {markee.name && <span className="text-[#8A8FBF] text-xs">{markee.name}</span>}
          {isOwner && (
            <span className="text-xs bg-[#F897FE]/15 border border-[#F897FE]/30 text-[#F897FE] px-2 py-0.5 rounded-full">
              yours
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <span className="text-[#F897FE] text-sm font-semibold">{formatFunds(markee.totalFundsAdded)}</span>
        <button onClick={onAddFunds} className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
          + add funds
        </button>
        {isOwner && (
          <button onClick={onEditMessage} className="text-xs text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
            edit message
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Integrations Section (top-level state router) ───────────────────────────

type TrafficData = { count: number; uniques: number; views: { timestamp: string; count: number; uniques: number }[]; cached: boolean } | null
type TrafficStatus = 'idle' | 'loading' | 'success' | 'error' | 'not_linked'

function IntegrationsSection({
  leaderboardAddress, githubUser, githubLoading, linkedFiles, linkedFilesLoading, repos, onFilesUpdated,
  traffic, trafficStatus, trafficError, refreshTraffic,
}: {
  leaderboardAddress: string
  githubUser: { login: string; avatarUrl: string } | null
  githubLoading: boolean
  linkedFiles: LinkedFile[]
  linkedFilesLoading: boolean
  repos: Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>
  onFilesUpdated: (files: LinkedFile[]) => void
  traffic: TrafficData
  trafficStatus: TrafficStatus
  trafficError: string | null
  refreshTraffic: () => void
}) {
  const liveFiles = linkedFiles.filter(f => f.verified)
  const isLoading = githubLoading || linkedFilesLoading

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-[#8A8FBF] text-sm py-4">
        <Loader2 size={15} className="animate-spin" />
        Checking integrations…
      </div>
    )
  }

  if (!githubUser) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Github size={18} className="text-[#8A8FBF]" />
          <h3 className="text-[#EDEEFF] font-bold text-lg">GitHub Integrations</h3>
          {liveFiles.length > 0 && (
            <span className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {liveFiles.length} live
            </span>
          )}
        </div>
        {linkedFiles.length === 0 ? (
          <p className="text-[#8A8FBF] text-sm mb-5">No GitHub integrations yet.</p>
        ) : (
          <div className="space-y-1.5 mb-6">
            {[...liveFiles, ...linkedFiles.filter(f => !f.verified)].map(file => (
              <ReadOnlyFileRow key={`${file.repoFullName}:${file.filePath}`} file={file} />
            ))}
          </div>
        )}
        <a
          href={`/api/github/connect?returnTo=/ecosystem/platforms/github/${leaderboardAddress}`}
          className="inline-flex items-center gap-2 bg-[#EDEEFF] text-[#060A2A] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE] transition-colors"
        >
          <Github size={14} />
          Connect GitHub to manage integrations
        </a>
      </div>
    )
  }

  if (linkedFiles.length === 0) {
    return (
      <SetupFlow
        leaderboardAddress={leaderboardAddress}
        githubUser={githubUser}
        repos={repos}
        linkedFiles={linkedFiles}
        onFilesUpdated={onFilesUpdated}
      />
    )
  }

  return (
    <RepoFileManager
      leaderboardAddress={leaderboardAddress}
      githubUser={githubUser}
      repos={repos}
      linkedFiles={linkedFiles}
      onFilesUpdated={onFilesUpdated}
      traffic={traffic}
      trafficStatus={trafficStatus}
      trafficError={trafficError}
      refreshTraffic={refreshTraffic}
    />
  )
}

// ─── Read-only file row ────────────────────────────────────────────────────────

function ReadOnlyFileRow({ file }: { file: LinkedFile }) {
  const fileUrl = `${file.repoHtmlUrl}/blob/HEAD/${file.filePath}`
  return (
    <div className="flex items-center gap-3 bg-[#060A2A] rounded-lg px-4 py-2.5 border border-[#8A8FBF]/10">
      {file.repoAvatarUrl && (
        <img src={file.repoAvatarUrl} alt={file.repoOwner} className="w-5 h-5 rounded-full flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[#EDEEFF] text-xs truncate">{file.repoFullName}</span>
          {file.verified
            ? <ShieldCheck size={10} className="text-green-400 flex-shrink-0" />
            : <ShieldAlert size={10} className="text-[#8A8FBF] flex-shrink-0" />
          }
        </div>
        <span className="text-[#7C9CFF] text-xs font-mono truncate block">{file.filePath}</span>
      </div>
      <a href={fileUrl} target="_blank" rel="noopener noreferrer"
        className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors flex-shrink-0" title="Open file on GitHub">
        <ExternalLink size={13} />
      </a>
    </div>
  )
}

// ─── Setup Flow ───────────────────────────────────────────────────────────────

function SetupFlow({
  leaderboardAddress, githubUser, repos, linkedFiles, onFilesUpdated,
}: {
  leaderboardAddress: string
  githubUser: { login: string; avatarUrl: string }
  repos: Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>
  linkedFiles: LinkedFile[]
  onFilesUpdated: (files: LinkedFile[]) => void
}) {
  const [delimCopied, setDelimCopied] = useState(false)
  const startTag = `<!-- MARKEE:START:${leaderboardAddress.toLowerCase()} -->`
  const endTag   = `<!-- MARKEE:END:${leaderboardAddress.toLowerCase()} -->`

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Github size={18} className="text-[#F897FE]" />
        <h3 className="text-[#EDEEFF] font-bold text-lg">Add to a GitHub File</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#060A2A] rounded-xl p-5 border border-[#8A8FBF]/15">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-xs font-bold">1</div>
            <h4 className="text-[#EDEEFF] font-semibold text-sm">Add these tags to your file</h4>
          </div>
          <p className="text-[#8A8FBF] text-xs mb-3">Paste them anywhere in a markdown file — the message will appear between them.</p>
          <div className="relative bg-[#0A0F3D] rounded-lg p-3 font-mono text-xs text-[#7C9CFF] leading-relaxed border border-[#8A8FBF]/10">
            {startTag}<br />{endTag}
            <button
              onClick={() => { navigator.clipboard.writeText(`${startTag}\n${endTag}`); setDelimCopied(true); setTimeout(() => setDelimCopied(false), 2000) }}
              className="absolute top-2 right-2 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
            >
              {delimCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            </button>
          </div>
          <p className="text-[#8A8FBF] text-xs mt-3">Markee writes the #1 message here automatically on every purchase.</p>
        </div>
        <div className="bg-[#060A2A] rounded-xl p-5 border border-[#8A8FBF]/15">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-xs font-bold">2</div>
            <h4 className="text-[#EDEEFF] font-semibold text-sm">Register the file</h4>
          </div>
          <div className="flex items-center gap-2 mb-3">
            {githubUser.avatarUrl && <img src={githubUser.avatarUrl} alt={githubUser.login} className="w-4 h-4 rounded-full" />}
            <span className="text-[#8A8FBF] text-xs">as @{githubUser.login}</span>
          </div>
          <RepoFilePicker
            leaderboardAddress={leaderboardAddress}
            repos={repos}
            existingLinks={linkedFiles}
            onLinked={onFilesUpdated}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Repo File Manager ────────────────────────────────────────────────────────

function RepoFileManager({
  leaderboardAddress, githubUser, repos, linkedFiles, onFilesUpdated,
  traffic, trafficStatus, trafficError, refreshTraffic,
}: {
  leaderboardAddress: string
  githubUser: { login: string; avatarUrl: string }
  repos: Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>
  linkedFiles: LinkedFile[]
  onFilesUpdated: (files: LinkedFile[]) => void
  traffic: TrafficData
  trafficStatus: TrafficStatus
  trafficError: string | null
  refreshTraffic: () => void
}) {
  const [actionKey, setActionKey]     = useState<string | null>(null)
  const [showAddFile, setShowAddFile] = useState(false)
  const [isSyncing, setIsSyncing]     = useState(false)
  const [syncResult, setSyncResult]   = useState<{ ok: boolean; message: string } | null>(null)
  const [delimCopied, setDelimCopied] = useState(false)

  const liveFiles    = linkedFiles.filter(f => f.verified)
  const awaitingFiles = linkedFiles.filter(f => !f.verified)
  const startTag = `<!-- MARKEE:START:${leaderboardAddress.toLowerCase()} -->`
  const endTag   = `<!-- MARKEE:END:${leaderboardAddress.toLowerCase()} -->`

  const handleVerify = async (file: LinkedFile) => {
    const key = `${file.repoFullName}:${file.filePath}`
    setActionKey(key)
    try {
      const res = await fetch('/api/github/verify-markee-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress, repoFullName: file.repoFullName, filePath: file.filePath }),
      })
      const data = await res.json()
      if (data.linkedFiles) onFilesUpdated(data.linkedFiles)
    } catch { /* retry */ } finally { setActionKey(null) }
  }

  const handleRemove = async (file: LinkedFile) => {
    const key = `${file.repoFullName}:${file.filePath}`
    setActionKey(key)
    try {
      const params = new URLSearchParams({ address: leaderboardAddress, repo: file.repoFullName, file: file.filePath })
      const res = await fetch(`/api/github/unlink-markee-file?${params}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.linkedFiles) onFilesUpdated(data.linkedFiles)
    } catch { /* retry */ } finally { setActionKey(null) }
  }

  const handleSync = async () => {
    setIsSyncing(true); setSyncResult(null)
    try {
      const res = await fetch('/api/github/update-markee-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult({ ok: false, message: data.error ?? `HTTP ${res.status}` })
      } else if (!data.success) {
        const failed = (data.results ?? []).find((r: { success: boolean; error?: string }) => !r.success)
        setSyncResult({ ok: false, message: failed?.error ?? 'Write failed — check Vercel logs' })
      } else {
        setSyncResult({ ok: true, message: 'Message synced ✓' })
        setTimeout(() => setSyncResult(null), 4000)
      }
    } catch (err) {
      setSyncResult({ ok: false, message: String(err) })
    } finally { setIsSyncing(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Github size={18} className="text-[#F897FE]" />
        <h3 className="text-[#EDEEFF] font-bold text-lg">GitHub Integrations</h3>
        {liveFiles.length > 0 && (
          <span className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {liveFiles.length} live
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {githubUser.avatarUrl && <img src={githubUser.avatarUrl} alt={githubUser.login} className="w-4 h-4 rounded-full" />}
            <span className="text-[#8A8FBF] text-xs">@{githubUser.login}</span>
          </div>
          <button
            onClick={() => setShowAddFile(v => !v)}
            className="flex items-center gap-1.5 text-xs text-[#8A8FBF] hover:text-[#F897FE] border border-[#8A8FBF]/30 hover:border-[#F897FE]/40 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={12} />
            Add file
          </button>
        </div>
      </div>

      {liveFiles.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
            <button
              onClick={handleSync} disabled={isSyncing}
              className="ml-auto flex items-center gap-1 text-[#8A8FBF] hover:text-[#7C9CFF] transition-colors text-xs disabled:opacity-40"
            >
              <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          {syncResult && (
            <p className={`text-xs mb-2 ${syncResult.ok ? 'text-green-400' : 'text-red-400'}`}>{syncResult.message}</p>
          )}
          <div className="space-y-1.5">
            {liveFiles.map(file => (
              <FileRow key={`${file.repoFullName}:${file.filePath}`} file={file} variant="live"
                isActing={actionKey === `${file.repoFullName}:${file.filePath}`}
                onRefresh={() => handleVerify(file)} />
            ))}
          </div>
        </div>
      )}

      {awaitingFiles.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center gap-1.5 bg-[#8A8FBF]/15 border border-[#8A8FBF]/30 text-[#8A8FBF] text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8A8FBF]" />
              Awaiting Integration
            </span>
          </div>
          <div className="space-y-1.5">
            {awaitingFiles.map(file => {
              const key = `${file.repoFullName}:${file.filePath}`
              return (
                <FileRow key={key} file={file} variant="awaiting" isActing={actionKey === key}
                  onCheck={() => handleVerify(file)} onRemove={() => handleRemove(file)} />
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-[#8A8FBF]/15">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-[#8A8FBF]" />
            <span className="text-[#8A8FBF] text-xs uppercase tracking-wider">GitHub Traffic (last 14 days)</span>
            {traffic?.cached && <span className="text-[#8A8FBF]/50 text-xs">· cached</span>}
          </div>
          <button
            onClick={refreshTraffic}
            disabled={trafficStatus === 'loading'}
            className="flex items-center gap-1 text-[#8A8FBF] hover:text-[#7C9CFF] transition-colors text-xs disabled:opacity-40"
          >
            <RefreshCw size={11} className={trafficStatus === 'loading' ? 'animate-spin' : ''} />
            {trafficStatus === 'loading' ? 'Loading…' : trafficStatus === 'idle' ? 'Load' : 'Refresh'}
          </button>
        </div>

        {trafficStatus === 'idle' && (
          <p className="text-[#8A8FBF] text-xs">Load GitHub view counts for this repo's traffic.</p>
        )}
        {trafficStatus === 'success' && traffic && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#060A2A] rounded-lg p-3 border border-[#8A8FBF]/10">
              <div className="text-[#F897FE] font-semibold text-xl">{traffic.count.toLocaleString()}</div>
              <div className="text-[#8A8FBF] text-xs mt-0.5">total views</div>
            </div>
            <div className="bg-[#060A2A] rounded-lg p-3 border border-[#8A8FBF]/10">
              <div className="text-[#7C9CFF] font-semibold text-xl">{traffic.uniques.toLocaleString()}</div>
              <div className="text-[#8A8FBF] text-xs mt-0.5">unique visitors</div>
            </div>
          </div>
        )}
        {trafficStatus === 'not_linked' && (
          <p className="text-[#8A8FBF] text-xs">No GitHub repo is linked to this sign yet.</p>
        )}
        {trafficStatus === 'error' && trafficError && (
          <div className="flex items-start gap-1.5 text-red-400 text-xs">
            <span className="mt-0.5">⚠</span>
            <span>
              {trafficError}
              {trafficError.includes('reconnect') && (
                <> — <a href="/ecosystem/platforms/github" className="text-[#7C9CFF] underline hover:text-[#F897FE]">reconnect GitHub</a></>
              )}
            </span>
          </div>
        )}
      </div>

      {showAddFile && (
        <div className="mt-4 border border-[#8A8FBF]/20 rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="bg-[#060A2A] p-5 border-b md:border-b-0 md:border-r border-[#8A8FBF]/15">
              <h4 className="text-[#EDEEFF] font-semibold text-sm mb-2">Tags for this sign</h4>
              <p className="text-[#8A8FBF] text-xs mb-3">Add these to the new file before registering.</p>
              <div className="relative bg-[#0A0F3D] rounded-lg p-3 font-mono text-xs text-[#7C9CFF] leading-relaxed border border-[#8A8FBF]/10">
                {startTag}<br />{endTag}
                <button
                  onClick={() => { navigator.clipboard.writeText(`${startTag}\n${endTag}`); setDelimCopied(true); setTimeout(() => setDelimCopied(false), 2000) }}
                  className="absolute top-2 right-2 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
                >
                  {delimCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <div className="bg-[#060A2A] p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[#EDEEFF] font-semibold text-sm">Register the file</h4>
                <button onClick={() => setShowAddFile(false)} className="text-[#8A8FBF] hover:text-[#EDEEFF]"><X size={14} /></button>
              </div>
              <RepoFilePicker
                leaderboardAddress={leaderboardAddress} repos={repos} existingLinks={linkedFiles}
                onLinked={(files) => { onFilesUpdated(files); setShowAddFile(false) }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── File Row ─────────────────────────────────────────────────────────────────

function FileRow({
  file, variant, isActing, onRefresh, onCheck, onRemove,
}: {
  file: LinkedFile
  variant: 'live' | 'awaiting'
  isActing?: boolean
  onRefresh?: () => void
  onCheck?:   () => void
  onRemove?:  () => void
}) {
  const fileUrl = `${file.repoHtmlUrl}/blob/HEAD/${file.filePath}`

  return (
    <div className="flex items-center gap-2 bg-[#0A0F3D] rounded-lg px-3 py-2 border border-[#8A8FBF]/10">
      {file.repoAvatarUrl && (
        <img src={file.repoAvatarUrl} alt={file.repoOwner} className="w-4 h-4 rounded-full flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[#EDEEFF] text-xs truncate">{file.repoFullName}</span>
          {variant === 'live'     && <ShieldCheck size={10} className="text-green-400 flex-shrink-0" />}
          {variant === 'awaiting' && <ShieldAlert size={10} className="text-[#8A8FBF] flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[#7C9CFF] text-xs font-mono truncate">{file.filePath}</span>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer"
            className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors flex-shrink-0">
            <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {variant === 'live' && onRefresh && (
        <button onClick={onRefresh} disabled={isActing}
          className="flex items-center gap-1 text-[#8A8FBF] hover:text-[#7C9CFF] transition-colors text-xs flex-shrink-0 disabled:opacity-40">
          <RefreshCw size={11} className={isActing ? 'animate-spin' : ''} />
        </button>
      )}

      {variant === 'awaiting' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {onCheck && (
            <button onClick={onCheck} disabled={isActing}
              className="flex items-center gap-1 text-[#8A8FBF] hover:text-[#F897FE] transition-colors text-xs disabled:opacity-40">
              <RefreshCw size={11} className={isActing ? 'animate-spin' : ''} />
              {!isActing && 'Check'}
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove} disabled={isActing}
              className="text-[#8A8FBF] hover:text-red-400 transition-colors disabled:opacity-40">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Repo File Picker ─────────────────────────────────────────────────────────

function RepoFilePicker({
  leaderboardAddress, repos, existingLinks, onLinked,
}: {
  leaderboardAddress: string
  repos: Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>
  existingLinks: LinkedFile[]
  onLinked: (files: LinkedFile[]) => void
}) {
  const [repoSearch, setRepoSearch] = useState('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<typeof repos[0] | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [fileDropdownOpen, setFileDropdownOpen] = useState(false)
  const [mdFiles, setMdFiles] = useState<string[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedRepo) { setMdFiles([]); setSelectedFile(''); return }
    setIsLoadingFiles(true)
    fetch(`/api/github/repo-files?repo=${encodeURIComponent(selectedRepo.fullName)}`)
      .then(r => r.json())
      .then(d => setMdFiles(d.files ?? []))
      .catch(() => setMdFiles([]))
      .finally(() => setIsLoadingFiles(false))
  }, [selectedRepo])

  const linkedPathsForRepo = new Set(
    existingLinks.filter(l => selectedRepo && l.repoFullName === selectedRepo.fullName).map(l => l.filePath)
  )
  const availableFiles = mdFiles.filter(f => !linkedPathsForRepo.has(f))

  const handleLink = async () => {
    if (!selectedRepo || !selectedFile) return
    setIsSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/github/register-markee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress, repoFullName: selectedRepo.fullName, filePath: selectedFile }),
      })
      const data = await res.json()
      if (data.success && data.linkedFiles) {
        onLinked(data.linkedFiles)
      } else {
        setSaveError(data.error ?? 'Could not link file')
      }
    } catch {
      setSaveError('Network error — try again')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredRepos = repos.filter(r => r.fullName.toLowerCase().includes(repoSearch.toLowerCase()))

  return (
    <div className="space-y-2">
      <div className="relative">
        {selectedRepo ? (
          <div className="flex items-center justify-between bg-[#0A0F3D] border border-[#F897FE]/40 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <img src={selectedRepo.avatarUrl} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
              <span className="text-[#EDEEFF] text-xs font-mono truncate">{selectedRepo.fullName}</span>
            </div>
            <button onClick={() => { setSelectedRepo(null); setRepoSearch(''); setSelectedFile('') }}
              className="text-[#8A8FBF] hover:text-[#EDEEFF] ml-2 flex-shrink-0"><X size={12} /></button>
          </div>
        ) : (
          <>
            <input type="text" value={repoSearch}
              onChange={e => { setRepoSearch(e.target.value); setRepoDropdownOpen(true) }}
              onFocus={() => setRepoDropdownOpen(true)}
              placeholder="Search repos…"
              className="w-full bg-[#0A0F3D] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-3 py-2 text-[#EDEEFF] text-xs font-mono outline-none transition-colors"
            />
            {repoDropdownOpen && filteredRepos.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {filteredRepos.slice(0, 20).map(r => (
                  <button key={r.id}
                    onClick={() => { setSelectedRepo(r); setRepoSearch(''); setRepoDropdownOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F897FE]/10 transition-colors text-left">
                    <img src={r.avatarUrl} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
                    <span className="text-[#EDEEFF] text-xs font-mono truncate">{r.fullName}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedRepo && (
        <div className="relative">
          {isLoadingFiles ? (
            <div className="flex items-center gap-2 text-[#8A8FBF] text-xs px-3 py-2">
              <Loader2 size={12} className="animate-spin" /> Loading files…
            </div>
          ) : selectedFile ? (
            <div className="flex items-center justify-between bg-[#0A0F3D] border border-[#F897FE]/40 rounded-lg px-3 py-2">
              <span className="text-[#EDEEFF] text-xs font-mono truncate">{selectedFile}</span>
              <button onClick={() => setSelectedFile('')} className="text-[#8A8FBF] hover:text-[#EDEEFF] ml-2 flex-shrink-0"><X size={12} /></button>
            </div>
          ) : (
            <>
              <button onClick={() => setFileDropdownOpen(o => !o)}
                className="w-full flex items-center justify-between bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/50 rounded-lg px-3 py-2 text-left transition-colors">
                <span className="text-[#8A8FBF] text-xs font-mono">
                  {availableFiles.length
                    ? `${availableFiles.length} file${availableFiles.length === 1 ? '' : 's'} available`
                    : mdFiles.length ? 'All files already linked' : 'No .md files found'}
                </span>
                <ChevronRight size={12} className={`text-[#8A8FBF] flex-shrink-0 transition-transform ${fileDropdownOpen ? 'rotate-90' : ''}`} />
              </button>
              {fileDropdownOpen && availableFiles.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                  {availableFiles.map(f => (
                    <button key={f} onClick={() => { setSelectedFile(f); setFileDropdownOpen(false) }}
                      className="w-full flex items-center px-3 py-2 hover:bg-[#F897FE]/10 transition-colors text-left">
                      <span className="text-[#EDEEFF] text-xs font-mono truncate">{f}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {saveError && <p className="text-red-400 text-xs">{saveError}</p>}

      <button onClick={handleLink} disabled={!selectedRepo || !selectedFile || isSaving}
        className="w-full flex items-center justify-center gap-1.5 bg-[#F897FE] text-[#060A2A] text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        {isSaving ? <><Loader2 size={12} className="animate-spin" /> Linking…</> : 'Link file'}
      </button>
    </div>
  )
}
