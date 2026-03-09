'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Github, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, ArrowRightLeft, ExternalLink,
  Zap, Copy, Check
} from 'lucide-react'
import {
  useReadContracts, useWriteContract, useWaitForTransactionReceipt,
  useAccount, useSwitchChain, useBalance
} from 'wagmi'
import { parseEther, formatEther, createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'

// ─── ABIs ────────────────────────────────────────────────────────────────────

const LEADERBOARD_ABI = [
  { inputs: [], name: 'leaderboardName', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalLeaderboardFunds', outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'markeeCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minimumPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'beneficiaryAddress', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxMessageLength', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'limit', type: 'uint256' }],
    name: 'getTopMarkees',
    outputs: [{ name: 'topAddresses', type: 'address[]' }, { name: 'topFunds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_message', type: 'string' }, { name: '_name', type: 'string' }],
    name: 'createMarkee',
    outputs: [{ name: 'markeeAddress', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'markeeAddress', type: 'address' }],
    name: 'addFunds',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'markeeAddress', type: 'address' }, { name: 'newMessage', type: 'string' }],
    name: 'updateMessage',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const MARKEE_ABI = [
  { inputs: [], name: 'message', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFundsAdded', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarkeeSlot {
  address: string
  message: string
  name: string
  owner: string
  totalFundsAdded: bigint
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GithubLeaderboardPage() {
  const params = useParams()
  const leaderboardAddress = (params.address as string) as `0x${string}`

  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [selectedMarkee, setSelectedMarkee] = useState<MarkeeSlot | null>(null)
  const [copied, setCopied] = useState(false)

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
  const admin = meta?.[4]?.result as string | undefined
  const maxMessageLength = meta?.[5]?.result as bigint | undefined
  const topResult = meta?.[6]?.result as [string[], bigint[]] | undefined

  // ── Read each markee's message/name/owner ─────────────────────────────────
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

  const markees: MarkeeSlot[] = topAddresses.map((addr, i) => ({
    address: addr,
    message: (markeeDetails?.[i * 3]?.result as string) ?? '',
    name: (markeeDetails?.[i * 3 + 1]?.result as string) ?? '',
    owner: (markeeDetails?.[i * 3 + 2]?.result as string) ?? '',
    totalFundsAdded: topFunds[i] ?? 0n,
  }))

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
              <p className="text-[#8A8FBF] text-sm mb-6">
                Be the first to buy a message on this leaderboard.
              </p>
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

      {/* GitHub integration CTA */}
      <section className="py-12 bg-[#0A0F3D] border-t border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-[#060A2A] rounded-2xl p-8 border border-[#8A8FBF]/20">
            <div>
              <h3 className="text-[#EDEEFF] font-bold text-lg mb-2">Auto-sync to SKILL.md</h3>
              <p className="text-[#8A8FBF] text-sm max-w-md">
                Connect your GitHub repo and Markee will automatically write the top message into your SKILL.md whenever it changes. Every AI agent that reads your codebase sees it.
              </p>
            </div>
            <a
              href="/api/github/connect"
              className="flex-shrink-0 flex items-center gap-2 bg-[#EDEEFF] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#F897FE] transition-colors whitespace-nowrap"
            >
              <Github size={18} />
              Connect a Repo
            </a>
          </div>
        </div>
      </section>

      <Footer />

      {/* Buy / Add Funds Modal */}
      {buyModalOpen && (
        <BuyMessageModal
          leaderboardAddress={leaderboardAddress}
          minimumPrice={minimumPrice ?? 0n}
          maxMessageLength={Number(maxMessageLength ?? 222n)}
          existingMarkee={selectedMarkee}
          onClose={() => { setBuyModalOpen(false); setSelectedMarkee(null) }}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}

// ─── Markee Row ───────────────────────────────────────────────────────────────

function MarkeeRow({
  markee,
  rank,
  formatFunds,
  onAddFunds,
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
        <button
          onClick={onAddFunds}
          className="text-xs text-[#7C9CFF] hover:text-[#F897FE] transition-colors"
        >
          + add funds
        </button>
      </div>
    </div>
  )
}

// ─── Buy Message Modal ────────────────────────────────────────────────────────

function BuyMessageModal({
  leaderboardAddress,
  minimumPrice,
  maxMessageLength,
  existingMarkee,
  onClose,
  onSuccess,
}: {
  leaderboardAddress: `0x${string}`
  minimumPrice: bigint
  maxMessageLength: number
  existingMarkee: MarkeeSlot | null
  onClose: () => void
  onSuccess: () => void
}) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: balanceData } = useBalance({ address, chainId: CANONICAL_CHAIN.id })

  const isAddFunds = !!existingMarkee
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState(existingMarkee?.message ?? '')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(
    minimumPrice > 0n ? formatEther(minimumPrice) : '0.001'
  )
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const amountWei = (() => {
    try { return parseEther(amount) } catch { return 0n }
  })()

  const canAfford = balanceData ? balanceData.value >= amountWei : true
  const charCount = message.length

  const handleSubmit = () => {
    setError(null)
    if (!isAddFunds && !message.trim()) {
      setError('Message cannot be empty.')
      return
    }
    if (charCount > maxMessageLength) {
      setError(`Message must be ${maxMessageLength} characters or less.`)
      return
    }
    if (amountWei <= 0n) {
      setError('Enter a valid ETH amount.')
      return
    }
    if (minimumPrice > 0n && amountWei < minimumPrice) {
      setError(`Minimum is ${formatEther(minimumPrice)} ETH.`)
      return
    }
    if (!canAfford) {
      setError('Insufficient ETH balance.')
      return
    }

    if (isAddFunds && existingMarkee) {
      writeContract({
        address: leaderboardAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'addFunds',
        args: [existingMarkee.address as `0x${string}`],
        value: amountWei,
      })
    } else {
      writeContract({
        address: leaderboardAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'createMarkee',
        args: [message, name],
        value: amountWei,
      })
    }
  }

  // Refetch + keep modal open briefly to show success
  if (isSuccess) {
    setTimeout(() => { onSuccess(); onClose() }, 2500)
  }

  const presets = ['0.001', '0.005', '0.01', '0.05']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors">
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">
              {isAddFunds ? 'Funds added!' : 'Message live!'}
            </p>
            <p className="text-[#8A8FBF] text-sm text-center">
              {isAddFunds
                ? 'Your boost has been recorded onchain.'
                : 'Your message is now on the leaderboard.'}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">
              {isAddFunds ? `Add Funds — #${existingMarkee ? '' : ''}` : 'Buy a Message'}
            </h2>

            {!isConnected ? (
              <div className="space-y-4">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to buy a message.</p>
                <ConnectButton />
              </div>
            ) : !isCorrectChain ? (
              <div className="space-y-4">
                <p className="text-[#8A8FBF] text-sm">Switch to Base to continue.</p>
                <button
                  onClick={() => switchChain({ chainId: CANONICAL_CHAIN.id })}
                  className="w-full flex items-center justify-center gap-2 bg-[#FFA94D] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
                >
                  <ArrowRightLeft size={16} />
                  Switch to Base
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Message input — only for new markees */}
                {!isAddFunds && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[#8A8FBF] text-xs uppercase tracking-wider">Your Message</label>
                      <span className={`text-xs ${charCount > maxMessageLength ? 'text-red-400' : 'text-[#8A8FBF]'}`}>
                        {charCount}/{maxMessageLength}
                      </span>
                    </div>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Write your message…"
                      rows={3}
                      className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors resize-none"
                    />
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Display name (optional)"
                      className="mt-2 w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-2.5 text-[#EDEEFF] text-sm outline-none transition-colors"
                    />
                  </div>
                )}

                {isAddFunds && existingMarkee?.message && (
                  <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15">
                    <div className="text-[#8A8FBF] text-xs mb-1 uppercase tracking-wider">Boosting</div>
                    <p className="text-[#EDEEFF] font-mono text-sm line-clamp-2">{existingMarkee.message}</p>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Amount (ETH)</label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {presets.map(p => (
                      <button
                        key={p}
                        onClick={() => setAmount(p)}
                        className={`text-xs py-2 rounded-lg border transition-all ${
                          amount === p
                            ? 'border-[#F897FE] bg-[#F897FE]/10 text-[#F897FE]'
                            : 'border-[#8A8FBF]/20 text-[#8A8FBF] hover:border-[#8A8FBF]/40'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    step="0.001"
                    min="0"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
                  />
                  {balanceData && (
                    <p className="text-[#8A8FBF] text-xs mt-1.5">
                      Balance: {parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH
                    </p>
                  )}
                </div>

                {/* Revenue split */}
                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-sm">
                  <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Revenue split</div>
                  <div className="flex justify-between">
                    <span className="text-[#EDEEFF]">Repo treasury</span>
                    <span className="text-[#F897FE] font-semibold">62%</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[#EDEEFF]">Markee Cooperative</span>
                    <span className="text-[#7C9CFF] font-semibold">38%</span>
                  </div>
                </div>

                {(error || writeError) && (
                  <div className="flex items-start gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error ?? writeError?.shortMessage ?? writeError?.message}</span>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isPending || isConfirming || !canAfford}
                  className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending || isConfirming ? (
                    <><Loader2 size={18} className="animate-spin" /> {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}</>
                  ) : isAddFunds ? (
                    <><Plus size={18} /> Add {amount} ETH</>
                  ) : (
                    <><Plus size={18} /> Buy for {amount} ETH</>
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
