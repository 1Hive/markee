'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, Github, Trophy, Plus, X, Loader2,
  CheckCircle2, AlertCircle, ArrowRightLeft,
  Zap, Copy, Check
} from 'lucide-react'
import {
  useReadContracts, useWriteContract, useWaitForTransactionReceipt,
  useAccount, useSwitchChain, useBalance
} from 'wagmi'
import { parseEther, formatEther } from 'viem'
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
              <div className="w-7 h-7 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-xs font-bold mb-3">2</div>
              <h4 className="text-[#EDEEFF] font-semibold text-sm mb-2">Connect your repo</h4>
              <p className="text-[#8A8FBF] text-xs mb-4">
                Authorize the Markee GitHub App so it can write between those delimiters whenever a new top message is set.
              </p>
              
                href="/api/github/connect"
                className="flex items-center gap-2 bg-[#EDEEFF] text-[#060A2A] text-xs font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE] transition-colors w-fit"
              >
                <Github size={14} />
                Connect on GitHub
              </a>
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

// ─── Buy Message Modal ────────────────────────────────────────────────────────

function BuyMessageModal({
  leaderboardAddress,
  minimumPrice,
  maxMessageLength,
  existingMarkee,
  topFundsAdded,
  onClose,
  onSuccess,
}: {
  leaderboardAddress: `0x${string}`
  minimumPrice: bigint
  maxMessageLength: number
  existingMarkee: MarkeeSlot | null
  topFundsAdded?: bigint
  onClose: () => void
  onSuccess: () => void
}) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: balanceData } = useBalance({ address, chainId: CANONICAL_CHAIN.id })

  const isAddFunds = !!existingMarkee
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // ── MARKEE token calculation ──────────────────────────────────────────────
  const getCurrentPhaseRate = () => {
    const PHASES = [
      { rate: 100000, endDate: new Date('2026-03-21T00:00:00Z') },
      { rate: 50000,  endDate: new Date('2026-06-21T00:00:00Z') },
      { rate: 25000,  endDate: new Date('2026-09-21T00:00:00Z') },
      { rate: 12500,  endDate: new Date('2026-12-21T00:00:00Z') },
      { rate: 6250,   endDate: new Date('2027-03-21T00:00:00Z') },
    ]
    const now = new Date()
    for (const phase of PHASES) {
      if (now < phase.endDate) return phase.rate
    }
    return PHASES[PHASES.length - 1].rate
  }

  const calculateMarkeeTokens = (ethAmount: number) =>
    ethAmount * getCurrentPhaseRate() * 0.62

  // ── Preset amounts ────────────────────────────────────────────────────────
  const MIN_INCREMENT = BigInt('1000000000000000') // 0.001 ETH
  const minimumAmount = minimumPrice > 0n ? minimumPrice : parseEther('0.001')
  const minimumAmountFormatted = Number(formatEther(minimumAmount)).toFixed(4)

  // Create tab: topFunds + 0.001, floored at minimumAmount
  const rawTakeFirst = topFundsAdded && topFundsAdded > 0n
    ? topFundsAdded + MIN_INCREMENT
    : null
  const takeFirstAmount = rawTakeFirst
    ? (rawTakeFirst >= minimumAmount ? rawTakeFirst : minimumAmount)
    : null
  const takeFirstAmountFormatted = takeFirstAmount
    ? Number(formatEther(takeFirstAmount)).toFixed(4)
    : null

  // Add funds tab: additional ETH needed to overtake
  const addFundsRawTakeFirst = topFundsAdded && topFundsAdded > 0n && existingMarkee
    ? topFundsAdded + MIN_INCREMENT - existingMarkee.totalFundsAdded
    : null
  const addFundsTakeFirstAmount = addFundsRawTakeFirst && addFundsRawTakeFirst > 0n
    ? addFundsRawTakeFirst
    : null
  const addFundsTakeFirstFormatted = addFundsTakeFirstAmount
    ? Number(formatEther(addFundsTakeFirstAmount)).toFixed(4)
    : null

  const activeTakeFirstFormatted = isAddFunds ? addFundsTakeFirstFormatted : takeFirstAmountFormatted
  const hasCompetition = isAddFunds
    ? !!addFundsTakeFirstAmount
    : !!(takeFirstAmount && takeFirstAmount >= minimumAmount)

  const userIsTopDawg = isAddFunds && existingMarkee && topFundsAdded !== undefined
    && existingMarkee.totalFundsAdded >= topFundsAdded

  // ── Set default amount on open ────────────────────────────────────────────
  useEffect(() => {
    if (hasCompetition && activeTakeFirstFormatted) {
      setAmount(activeTakeFirstFormatted)
    } else {
      setAmount(minimumAmountFormatted)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Close after success ───────────────────────────────────────────────────
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => { onSuccess(); onClose() }, 2500)
    }
  }, [isSuccess, onSuccess, onClose])

  const amountWei = (() => { try { return parseEther(amount) } catch { return 0n } })()
  const canAfford = balanceData ? balanceData.value >= amountWei : true

  const handleSubmit = () => {
    setError(null)
    if (!isAddFunds && !message.trim()) { setError('Message cannot be empty.'); return }
    if (message.length > maxMessageLength) { setError(`Max ${maxMessageLength} characters.`); return }
    if (amountWei <= 0n) { setError('Enter a valid ETH amount.'); return }
    if (amountWei < minimumAmount) { setError(`Minimum is ${formatEther(minimumAmount)} ETH.`); return }
    if (!canAfford) { setError('Insufficient ETH balance.'); return }

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

  // ── Amount selector ───────────────────────────────────────────────────────
  const amountSelectorJSX = (
    <div className="space-y-3">
      {userIsTopDawg && (
        <div className="rounded-xl p-4 border-2 border-[#FFD700]/50 bg-[#FFD700]/10 flex items-start gap-3">
          <Trophy size={20} className="text-[#FFD700] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#FFD700]">👑 This message holds the top spot!</p>
            <p className="text-xs text-[#FFD700]/80 mt-0.5">Add more funds to make it harder to overtake.</p>
          </div>
        </div>
      )}

      <label className="block text-[#8A8FBF] text-xs uppercase tracking-wider">Amount (ETH)</label>

      {!userIsTopDawg && (
        <div className={`grid ${hasCompetition ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
          {hasCompetition && activeTakeFirstFormatted && (
            <button
              type="button"
              onClick={() => setAmount(activeTakeFirstFormatted)}
              className={`rounded-lg p-3 border-2 transition-all text-left ${
                amount === activeTakeFirstFormatted
                  ? 'border-[#F897FE] bg-[#F897FE]/10'
                  : 'border-[#F897FE]/30 hover:border-[#F897FE]/60 bg-[#060A2A]'
              }`}
            >
              <div className="flex items-center gap-1 mb-1">
                <p className="text-xs font-medium text-[#F897FE]">Featured Message</p>
                <span className="text-[10px]">👑</span>
              </div>
              <p className="text-sm font-bold text-[#EDEEFF]">{activeTakeFirstFormatted} ETH</p>
              <p className="text-[10px] text-[#F897FE] mt-0.5">
                {isAddFunds ? 'Additional ETH needed to take the top spot' : 'Price to take the top spot'}
              </p>
            </button>
          )}
          {!isAddFunds && (
            <button
              type="button"
              onClick={() => setAmount(minimumAmountFormatted)}
              className={`rounded-lg p-3 border-2 transition-all text-left ${
                amount === minimumAmountFormatted
                  ? 'border-[#8A8FBF] bg-[#8A8FBF]/10'
                  : 'border-[#8A8FBF]/20 hover:border-[#8A8FBF]/50 bg-[#060A2A]'
              }`}
            >
              <p className="text-xs font-medium text-[#8A8FBF] mb-1">Minimum</p>
              <p className="text-sm font-bold text-[#EDEEFF]">{minimumAmountFormatted} ETH</p>
              <p className="text-[10px] text-[#8A8FBF] mt-0.5">Buy a message at the lowest price</p>
            </button>
          )}
        </div>
      )}

      <input
        type="number"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder={minimumAmountFormatted}
        step="0.001"
        min="0"
        className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors"
      />
      {balanceData && (
        <p className="text-xs text-[#8A8FBF]">
          Balance: {parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH
        </p>
      )}
    </div>
  )

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
              {isAddFunds ? 'Your boost has been recorded onchain.' : 'Your message is now on the leaderboard.'}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">
              {isAddFunds ? 'Add Funds' : 'Buy a Message'}
            </h2>

            {!isConnected ? (
              <div className="space-y-4">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to continue.</p>
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
                {/* Message input — create only */}
                {!isAddFunds && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[#8A8FBF] text-xs uppercase tracking-wider">Your Message</label>
                      <span className={`text-xs ${message.length > maxMessageLength ? 'text-red-400' : 'text-[#8A8FBF]'}`}>
                        {message.length}/{maxMessageLength}
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

                {/* Boosting preview — addFunds */}
                {isAddFunds && existingMarkee?.message && (
                  <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15">
                    <div className="text-[#8A8FBF] text-xs mb-1 uppercase tracking-wider">Boosting</div>
                    <p className="text-[#EDEEFF] font-mono text-sm line-clamp-2">{existingMarkee.message}</p>
                  </div>
                )}

                {amountSelectorJSX}

                {/* MARKEE token display */}
                {amount && parseFloat(amount) > 0 && (
                  <div className="bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 border-2 border-[#F897FE]/50 rounded-xl p-6 text-center">
                    <p className="text-sm text-[#F897FE] font-medium mb-2">You'll receive</p>
                    <p className="text-4xl font-bold text-[#F897FE] mb-1">
                      {calculateMarkeeTokens(parseFloat(amount)).toLocaleString()}
                    </p>
                    <p className="text-xl font-semibold text-[#F897FE]">MARKEE tokens</p>
                  </div>
                )}

                {/* Payment info panel */}
                {isAddFunds && existingMarkee ? (
                  <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#8A8FBF] text-xs">Current funds</span>
                      <span className="text-xs font-medium text-[#EDEEFF]">{formatEther(existingMarkee.totalFundsAdded)} ETH</span>
                    </div>
                    {amount && parseFloat(amount) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#8A8FBF] text-xs">Adding</span>
                        <span className="text-xs font-medium text-[#7C9CFF]">+ {amount} ETH</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[#8A8FBF]/15 pt-2">
                      <span className="text-[#8A8FBF] text-xs font-semibold">New total</span>
                      <span className="text-sm font-bold text-[#F897FE]">
                        {amount && parseFloat(amount) > 0
                          ? (parseFloat(formatEther(existingMarkee.totalFundsAdded)) + parseFloat(amount)).toFixed(4)
                          : formatEther(existingMarkee.totalFundsAdded)
                        } ETH
                      </span>
                    </div>
                  </div>
                ) : (
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
                )}

                {(error || writeError) && (
                  <div className="flex items-start gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error ?? writeError?.message}</span>
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
                    <>Add {amount} ETH</>
                  ) : (
                    <>Buy for {amount} ETH</>
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
