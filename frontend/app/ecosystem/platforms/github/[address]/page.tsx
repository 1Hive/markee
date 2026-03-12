'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Github, Trophy, Plus, Zap, Copy, Check, CheckCircle2, Loader2, X,
} from 'lucide-react'
import {
  useReadContracts, useAccount,
} from 'wagmi'
import { formatEther } from 'viem'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { BuyMessageModal, type MarkeeSlot } from '@/components/modals/BuyMessageModal'

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
  const [repoStatus, setRepoStatus] = useState<{
    linked: boolean
    repoFullName?: string
    repoAvatarUrl?: string
    repoHtmlUrl?: string
    filePath?: string
  } | null>(null)
  const [repos, setRepos] = useState<Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>>([])
  const [mdFiles, setMdFiles] = useState<string[]>([])

  const fetchRepoStatus = useCallback(async () => {
    const res = await fetch(`/api/github/repo-status?address=${leaderboardAddress}`)
    const data = await res.json()
    setRepoStatus(data)
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

    fetchRepoStatus()
  }, [fetchRepoStatus])

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
  const markeeCount = meta?.[2]?.result as bigint | undefined
  const minimumPrice = meta?.[3]?.result as bigint | undefined
  const maxMessageLength = meta?.[5]?.result as bigint | undefined
  const topResult = meta?.[6]?.result as [string[], bigint[]] | undefined

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
            <span className="text-[#EDEEFF] truncate max-w-xs">{leaderboardName ?? 'Loading…'}</span>
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
                  {leaderboardName ?? <span className="opacity-40">Loading…</span>}
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

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-8 mt-8">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{markeeCount?.toString() ?? '—'}</span>
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

      {/* GitHub integration instructions */}
      <section className="py-12 bg-[#0A0F3D] border-t border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <Github size={18} className="text-[#F897FE]" />
            <h3 className="text-[#EDEEFF] font-bold text-lg">Add to a GitHub File</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#060A2A] rounded-xl p-5 border border-[#8A8FBF]/15">
              <div className="w-7 h-7 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-xs font-bold mb-3">1</div>
              <h4 className="text-[#EDEEFF] font-semibold text-sm mb-2">Add delimiters to your file</h4>
              <p className="text-[#8A8FBF] text-xs mb-3">Paste these two comments where you want the Markee block to appear:</p>
              <div className="bg-[#0A0F3D] rounded-lg p-3 font-mono text-xs text-[#7C9CFF] leading-relaxed border border-[#8A8FBF]/10">
                {'<!-- MARKEE:START -->'}<br />
                {'<!-- MARKEE:END -->'}
              </div>
            </div>

            <div className="bg-[#060A2A] rounded-xl p-5 border border-[#8A8FBF]/15">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-3 ${
                repoStatus?.linked
                  ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                  : 'bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE]'
              }`}>
                {repoStatus?.linked ? <CheckCircle2 size={14} /> : '2'}
              </div>
              <h4 className="text-[#EDEEFF] font-semibold text-sm mb-2">Connect your repo</h4>

              {githubLoading || repoStatus === null ? (
                <p className="text-[#8A8FBF] text-xs">Checking connection…</p>

              ) : repoStatus.linked ? (
                /* ── Already linked ── */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {repoStatus.repoAvatarUrl && (
                      <img src={repoStatus.repoAvatarUrl} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    <a
                      href={repoStatus.repoHtmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#7C9CFF] text-xs font-mono hover:text-[#F897FE] transition-colors"
                    >
                      {repoStatus.repoFullName}
                    </a>
                  </div>
                  {repoStatus.filePath && (
                    <p className="text-[#8A8FBF] text-xs font-mono">{repoStatus.filePath}</p>
                  )}
                  <p className="text-green-400 text-xs">✓ Integration active</p>
                </div>

              ) : !githubUser ? (
                /* ── Not connected to GitHub ── */
                <>
                  <p className="text-[#8A8FBF] text-xs mb-4">
                    Authorize Markee on GitHub so it can write between those delimiters whenever a new top message is set.
                  </p>
                  <a
                    href={`/api/github/connect?returnTo=/ecosystem/platforms/github/${leaderboardAddress}`}
                    className="flex items-center gap-2 bg-[#EDEEFF] text-[#060A2A] text-xs font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE] transition-colors w-fit"
                  >
                    <Github size={14} />
                    Connect on GitHub
                  </a>
                </>

              ) : (
                /* ── Connected but not yet linked — show picker ── */
                <RepoLinker
                  leaderboardAddress={leaderboardAddress}
                  githubUser={githubUser}
                  repos={repos}
                  mdFiles={mdFiles}
                  setMdFiles={setMdFiles}
                  onLinked={fetchRepoStatus}
                />
              )}
            </div>

            <div className="bg-[#060A2A] rounded-xl p-5 border border-[#8A8FBF]/15">
              <div className="w-7 h-7 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-xs font-bold mb-3">3</div>
              <h4 className="text-[#EDEEFF] font-semibold text-sm mb-2">It updates automatically</h4>
              <p className="text-[#8A8FBF] text-xs">
                Whenever someone takes the top spot on this leaderboard, Markee pushes a commit that updates the block in your file. Every AI agent reading your repo sees the current top message.
              </p>
            </div>
          </div>

          <p className="text-[#8A8FBF] text-xs mt-5">
            This leaderboard address:{' '}
            <span className="font-mono text-[#7C9CFF]">{leaderboardAddress}</span>
            {' '}— one Markee sign can sync to multiple files by reusing the same delimiters in each.
          </p>
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
          onSuccess={refetch}
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

// ─── Repo Linker ──────────────────────────────────────────────────────────────

function RepoLinker({
  leaderboardAddress,
  githubUser,
  repos,
  mdFiles,
  setMdFiles,
  onLinked,
}: {
  leaderboardAddress: string
  githubUser: { login: string; avatarUrl: string }
  repos: Array<{ id: number; fullName: string; owner: string; avatarUrl: string; private: boolean }>
  mdFiles: string[]
  setMdFiles: (files: string[]) => void
  onLinked: () => void
}) {
  const [repoSearch, setRepoSearch] = useState('')
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<typeof repos[0] | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [fileDropdownOpen, setFileDropdownOpen] = useState(false)
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
  }, [selectedRepo, setMdFiles])

  const handleLink = async () => {
    if (!selectedRepo || !selectedFile) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/github/register-markee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderboardAddress,
          repoFullName: selectedRepo.fullName,
          filePath: selectedFile,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onLinked()
      } else {
        setSaveError(data.error ?? 'Could not link repo')
      }
    } catch {
      setSaveError('Network error — try again')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredRepos = repos.filter(r =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  )

  return (
    <div className="space-y-3 mt-1">
      <div className="flex items-center gap-2 mb-1">
        {githubUser.avatarUrl && (
          <img src={githubUser.avatarUrl} alt={githubUser.login} className="w-4 h-4 rounded-full" />
        )}
        <span className="text-[#8A8FBF] text-xs">@{githubUser.login}</span>
      </div>

      {/* Repo picker */}
      <div className="relative">
        {selectedRepo ? (
          <div className="flex items-center justify-between bg-[#0A0F3D] border border-[#F897FE]/40 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <img src={selectedRepo.avatarUrl} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
              <span className="text-[#EDEEFF] text-xs font-mono truncate">{selectedRepo.fullName}</span>
            </div>
            <button onClick={() => { setSelectedRepo(null); setRepoSearch(''); setSelectedFile('') }} className="text-[#8A8FBF] hover:text-[#EDEEFF] ml-2 flex-shrink-0">
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={repoSearch}
              onChange={e => { setRepoSearch(e.target.value); setRepoDropdownOpen(true) }}
              onFocus={() => setRepoDropdownOpen(true)}
              placeholder="Search repos…"
              className="w-full bg-[#0A0F3D] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-3 py-2 text-[#EDEEFF] text-xs font-mono outline-none transition-colors"
            />
            {repoDropdownOpen && filteredRepos.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {filteredRepos.slice(0, 20).map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRepo(r); setRepoSearch(''); setRepoDropdownOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F897FE]/10 transition-colors text-left"
                  >
                    <img src={r.avatarUrl} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
                    <span className="text-[#EDEEFF] text-xs font-mono truncate">{r.fullName}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* File picker */}
      {selectedRepo && (
        <div className="relative">
          {isLoadingFiles ? (
            <div className="flex items-center gap-2 text-[#8A8FBF] text-xs px-3 py-2">
              <Loader2 size={12} className="animate-spin" /> Loading files…
            </div>
          ) : selectedFile ? (
            <div className="flex items-center justify-between bg-[#0A0F3D] border border-[#F897FE]/40 rounded-lg px-3 py-2">
              <span className="text-[#EDEEFF] text-xs font-mono truncate">{selectedFile}</span>
              <button onClick={() => setSelectedFile('')} className="text-[#8A8FBF] hover:text-[#EDEEFF] ml-2 flex-shrink-0">
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setFileDropdownOpen(o => !o)}
                className="w-full flex items-center justify-between bg-[#0A0F3D] border border-[#8A8FBF]/20 hover:border-[#F897FE]/50 rounded-lg px-3 py-2 text-left transition-colors"
              >
                <span className="text-[#8A8FBF] text-xs font-mono">
                  {mdFiles.length ? `${mdFiles.length} files — pick one` : 'No .md files found'}
                </span>
                <ChevronRight size={12} className={`text-[#8A8FBF] flex-shrink-0 transition-transform ${fileDropdownOpen ? 'rotate-90' : ''}`} />
              </button>
              {fileDropdownOpen && mdFiles.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                  {mdFiles.map(f => (
                    <button
                      key={f}
                      onClick={() => { setSelectedFile(f); setFileDropdownOpen(false) }}
                      className="w-full flex items-center px-3 py-2 hover:bg-[#F897FE]/10 transition-colors text-left"
                    >
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

      <button
        onClick={handleLink}
        disabled={!selectedRepo || !selectedFile || isSaving}
        className="w-full flex items-center justify-center gap-1.5 bg-[#F897FE] text-[#060A2A] text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSaving ? <><Loader2 size={12} className="animate-spin" /> Linking…</> : 'Link repo & file'}
      </button>
    </div>
  )
}
