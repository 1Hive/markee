'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Github, Trophy, Plus, Zap, Copy, Check, CheckCircle2,
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
  const [copied, setCopied] = useState(false)
  const [githubUser, setGithubUser] = useState<{ login: string; avatarUrl: string } | null>(null)
  const [githubLoading, setGithubLoading] = useState(true)

  useEffect(() => {
    fetch('/api/github/me')
      .then(r => r.json())
      .then(data => {
        setGithubUser(data.connected ? { login: data.login, avatarUrl: data.avatarUrl } : null)
      })
      .catch(() => setGithubUser(null))
      .finally(() => setGithubLoading(false))
  }, [])

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
                <div className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">Top Message</div>
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
                  onAddFunds={() => { setSelectedMarkee(markee); setBuyModalOpen(true) }}
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
                githubUser
                  ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                  : 'bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE]'
              }`}>
                {githubUser ? <CheckCircle2 size={14} /> : '2'}
              </div>
              <h4 className="text-[#EDEEFF] font-semibold text-sm mb-2">Connect your repo</h4>
              {githubLoading ? (
                <p className="text-[#8A8FBF] text-xs">Checking connection…</p>
              ) : githubUser ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {githubUser.avatarUrl && (
                      <img src={githubUser.avatarUrl} alt={githubUser.login} className="w-5 h-5 rounded-full" />
                    )}
                    <span className="text-green-400 text-xs font-medium">Connected as @{githubUser.login}</span>
                  </div>
                  <p className="text-[#8A8FBF] text-xs">
                    Select a repo and file to link on the{' '}
                    <Link href="/ecosystem/platforms/github" className="text-[#7C9CFF] hover:text-[#F897FE] transition-colors">
                      GitHub platform page
                    </Link>
                    .
                  </p>
                  <button
                    onClick={async () => {
                      await fetch('/api/github/me', { method: 'DELETE' })
                      setGithubUser(null)
                    }}
                    className="text-[#8A8FBF] hover:text-red-400 text-xs transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[#8A8FBF] text-xs mb-4">
                    Authorize the Markee GitHub App so it can write between those delimiters whenever a new top message is set.
                  </p>
                  <a
                    href={`/api/github/connect?returnTo=/ecosystem/platforms/github/${leaderboardAddress}`}
                    className="flex items-center gap-2 bg-[#EDEEFF] text-[#060A2A] text-xs font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE] transition-colors w-fit"
                  >
                    <Github size={14} />
                    Connect on GitHub
                  </a>
                </>
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
          onClose={() => { setBuyModalOpen(false); setSelectedMarkee(null) }}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}

// ─── Markee Row ───────────────────────────────────────────────────────────────

function MarkeeRow({
  markee, rank, formatFunds, onAddFunds,
}: {
  markee: MarkeeSlot
  rank: number
  formatFunds: (wei: bigint) => string
  onAddFunds: () => void
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
      </div>
    </div>
  )
}
