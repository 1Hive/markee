'use client'

import { useState, useEffect } from 'react'
import {
  Trophy, X, Loader2, CheckCircle2, AlertCircle, ArrowRightLeft, Plus, ExternalLink,
  CreditCard, Wallet,
} from 'lucide-react'
import {
  useWriteContract, useWaitForTransactionReceipt,
  useAccount, useSwitchChain, useBalance, useReadContract,
} from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { base } from 'viem/chains'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { useSuperfluidPoints } from '@/lib/superfluid/useSuperfluidPoints'

// ─── ABI (only the functions this modal calls) ────────────────────────────────

const LEADERBOARD_ABI = [
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
    inputs: [{ name: 'markeeAddress', type: 'address' }, { name: '_message', type: 'string' }],
    name: 'updateMessage',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'beneficiaryAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarkeeSlot {
  address: string
  message: string
  name: string
  owner: string
  totalFundsAdded: bigint
}

interface BuyMessageModalProps {
  leaderboardAddress: `0x${string}`
  minimumPrice: bigint
  maxMessageLength: number
  existingMarkee: MarkeeSlot | null
  topFundsAdded?: bigint
  initialMode?: 'create' | 'addFunds' | 'updateMessage'
  onClose: () => void
  onSuccess: () => void
  /** Controls platform-specific side-effects on purchase success.
   *  - 'github'     → writes to SKILL.md via /api/github/update-markee-file (default)
   *  - 'superfluid' → tracks Superfluid points via useSuperfluidPoints; skips GitHub write
   */
  platformId?: 'github' | 'superfluid'
}

// ─── MARKEE token helpers ─────────────────────────────────────────────────────

const PHASES = [
  { rate: 100000, endDate: new Date('2026-03-21T00:00:00Z') },
  { rate: 50000,  endDate: new Date('2026-06-21T00:00:00Z') },
  { rate: 25000,  endDate: new Date('2026-09-21T00:00:00Z') },
  { rate: 12500,  endDate: new Date('2026-12-21T00:00:00Z') },
  { rate: 6250,   endDate: new Date('2027-03-21T00:00:00Z') },
]

function getCurrentPhaseRate(): number {
  const now = new Date()
  for (const phase of PHASES) {
    if (now < phase.endDate) return phase.rate
  }
  return PHASES[PHASES.length - 1].rate
}

function calculateMarkeeTokens(ethAmount: number): number {
  // 62% of ETH goes to the beneficiary; only 38% reaches RevNet for token issuance.
  // The buyer receives 62% of the tokens issued against that 38%.
  return ethAmount * 0.38 * getCurrentPhaseRate() * 0.62
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BuyMessageModal({
  leaderboardAddress,
  minimumPrice,
  maxMessageLength,
  existingMarkee,
  topFundsAdded,
  initialMode,
  onClose,
  onSuccess,
  platformId,
}: BuyMessageModalProps) {
  const { address, isConnected, chain } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: balanceData } = useBalance({ address, chainId: CANONICAL_CHAIN.id })
  const { trackBuyMessage, trackAddFunds } = useSuperfluidPoints()
  const { login } = usePrivy()
  const { fundWallet } = useFundWallet()
  const [isFunding, setIsFunding] = useState(false)

  const { data: beneficiaryAddress } = useReadContract({
    address: leaderboardAddress,
    abi: LEADERBOARD_ABI,
    functionName: 'beneficiaryAddress',
    chainId: CANONICAL_CHAIN.id,
  })

  const isUpdateMessage = initialMode === 'updateMessage'
  const isAddFunds = !isUpdateMessage && !!existingMarkee
  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // ── Preset amounts ────────────────────────────────────────────────────────
  const MIN_INCREMENT = BigInt('1000000000000000') // 0.001 ETH
  const minimumAmount = minimumPrice > 0n ? minimumPrice : parseEther('0.001')
  const minimumAmountFormatted = Number(formatEther(minimumAmount)).toFixed(3)

  const rawTakeFirst = topFundsAdded && topFundsAdded > 0n
    ? topFundsAdded + MIN_INCREMENT
    : null
  const takeFirstAmount = rawTakeFirst
    ? (rawTakeFirst >= minimumAmount ? rawTakeFirst : minimumAmount)
    : null
  const takeFirstAmountFormatted = takeFirstAmount
    ? Number(formatEther(takeFirstAmount)).toFixed(3)
    : null

  const addFundsRawTakeFirst = topFundsAdded && topFundsAdded > 0n && existingMarkee
    ? topFundsAdded + MIN_INCREMENT - existingMarkee.totalFundsAdded
    : null
  const addFundsTakeFirstAmount = addFundsRawTakeFirst && addFundsRawTakeFirst > 0n
    ? addFundsRawTakeFirst
    : null
  const addFundsTakeFirstFormatted = addFundsTakeFirstAmount
    ? Number(formatEther(addFundsTakeFirstAmount)).toFixed(3)
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

  // ── Platform-specific success side-effects ────────────────────────────────
  useEffect(() => {
    if (!isSuccess) return

    if (platformId === 'superfluid') {
      // Track points — skip for updateMessage (no ETH transferred)
      if (!isUpdateMessage && address && receipt) {
        const amountWei = (() => { try { return parseEther(amount).toString() } catch { return '0' } })()
        const txHash = receipt.transactionHash
        if (isAddFunds) {
          trackAddFunds(address, amountWei, txHash).catch(console.error)
        } else {
          trackBuyMessage(address, amountWei, txHash).catch(console.error)
        }
      }
    } else {
      // Default: GitHub — fire best-effort SKILL.md write
      fetch('/api/github/update-markee-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardAddress }),
      }).catch(() => {})
    }

    setTimeout(() => { onSuccess(); onClose() }, 2500)
  // amount is captured at confirmation time — intentionally excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const amountWei = (() => { try { return parseEther(amount) } catch { return 0n } })()
  const canAfford = balanceData ? balanceData.value >= amountWei : true

  const handleSubmit = () => {
    setError(null)
    if (isUpdateMessage) {
      if (!message.trim()) { setError('Message cannot be empty.'); return }
      if (message.length > maxMessageLength) { setError(`Max ${maxMessageLength} characters.`); return }
      if (!existingMarkee) return
      writeContract({
        address: leaderboardAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'updateMessage',
        args: [existingMarkee.address as `0x${string}`, message],
      })
      return
    }
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
          Balance: {parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH
        </p>
      )}
    </div>
  )

  // ── Token + beneficiary split display ────────────────────────────────────
  const shortBeneficiary = beneficiaryAddress
    ? `${beneficiaryAddress.slice(0, 6)}…${beneficiaryAddress.slice(-4)}`
    : null
  const basescanUrl = beneficiaryAddress
    ? `https://basescan.org/address/${beneficiaryAddress}`
    : null

  const tokenDisplayJSX = amount && parseFloat(amount) > 0 ? (
    <div className={`grid ${beneficiaryAddress ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
      <div className="bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 border-2 border-[#F897FE]/50 rounded-xl p-6 text-center">
        <p className="text-sm text-[#F897FE] font-medium mb-2">You&apos;ll receive</p>
        <p className="text-4xl font-bold text-[#F897FE] mb-1">
          {calculateMarkeeTokens(parseFloat(amount)).toLocaleString()}
        </p>
        <p className="text-xl font-semibold text-[#F897FE]">MARKEE tokens</p>
      </div>

      {beneficiaryAddress && (
        <div className="bg-gradient-to-r from-[#FFA94D]/20 to-[#FF8E3D]/20 border-2 border-[#FFA94D]/50 rounded-xl p-6 text-center">
          <p className="text-sm text-[#FFA94D] font-medium mb-2">Beneficiary receives</p>
          <p className="text-4xl font-bold text-[#FFA94D] mb-1">
            {(() => {
              const value = parseFloat(amount) * 0.62
              if (value === 0) return '0'
              if (value < 0.00001) return '< 0.00001'
              return Number(value.toFixed(5)).toString()
            })()}
          </p>
          <p className="text-xl font-semibold text-[#FFA94D]">ETH</p>
        </div>
      )}
    </div>
  ) : null

  // ── Revenue split info panel ──────────────────────────────────────────────
  const revenueSplitJSX = (
    <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-sm">
      <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Revenue split</div>
      <div className="flex justify-between items-center">
        {beneficiaryAddress && shortBeneficiary && basescanUrl ? (
          <a
            href={basescanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#EDEEFF] hover:text-[#FFA94D] transition-colors font-mono text-xs"
          >
            {shortBeneficiary}
            <ExternalLink size={11} className="opacity-60" />
          </a>
        ) : (
          <span className="text-[#EDEEFF]">Project treasury</span>
        )}
        <span className="text-[#FFA94D] font-semibold">62%</span>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[#EDEEFF]">Markee Cooperative</span>
        <span className="text-[#7C9CFF] font-semibold">38%</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-gradient-to-br from-[#0A0F3D] to-[#060A2A] border border-[#8A8FBF]/30 rounded-xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors">
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">
              {isUpdateMessage ? 'Message updated!' : isAddFunds ? 'Funds added!' : 'Message live!'}
            </p>
            <p className="text-[#8A8FBF] text-sm text-center">
              {isUpdateMessage ? 'Your new message is now live.' : isAddFunds ? 'Your boost has been recorded onchain.' : 'Your message is now on the leaderboard.'}
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">
              {isUpdateMessage ? 'Edit Message' : isAddFunds ? 'Add Funds' : 'Buy a Message'}
            </h2>

            {!isConnected ? (
              <div className="space-y-4">
                <p className="text-[#8A8FBF] text-sm">Sign in to buy a message -- use email, social, or a crypto wallet.</p>
                <button
                  onClick={login}
                  type="button"
                  className="w-full flex items-center justify-center gap-2 bg-[#7C9CFF] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#F897FE] transition-colors"
                >
                  <Wallet size={18} />
                  Sign in to continue
                </button>
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
            ) : isUpdateMessage && existingMarkee ? (
              /* ── Update message ── */
              <div className="space-y-5">
                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15">
                  <div className="text-[#8A8FBF] text-xs mb-1 uppercase tracking-wider">Current message</div>
                  <p className="text-[#EDEEFF] font-mono text-sm">{existingMarkee.message}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[#8A8FBF] text-xs uppercase tracking-wider">New Message</label>
                    <span className={`text-xs ${message.length > maxMessageLength ? 'text-red-400' : 'text-[#8A8FBF]'}`}>
                      {message.length}/{maxMessageLength}
                    </span>
                  </div>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Write your new message…"
                    rows={3}
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors resize-none"
                  />
                </div>
                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-xs text-[#8A8FBF]">
                  💡 Only the owner can update a message. Anyone can add funds to move it up the leaderboard.
                </div>
                {(error || writeError) && (
                  <div className="flex items-start gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error ?? writeError?.message}</span>
                  </div>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={isPending || isConfirming || !message.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending || isConfirming ? (
                    <><Loader2 size={18} className="animate-spin" /> {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}</>
                  ) : (
                    'Update Message'
                  )}
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

                {/* MARKEE token display + optional partner ETH panel */}
                {tokenDisplayJSX}

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
                          ? (parseFloat(formatEther(existingMarkee.totalFundsAdded)) + parseFloat(amount)).toFixed(3)
                          : formatEther(existingMarkee.totalFundsAdded)
                        } ETH
                      </span>
                    </div>
                  </div>
                ) : (
                  revenueSplitJSX
                )}

                {!isUpdateMessage && !canAfford && (
                  <div className="space-y-2">
                    <p className="text-xs text-[#8A8FBF] text-center">
                      Your wallet balance is too low for this amount.
                    </p>
                    <button
                      type="button"
                      disabled={isFunding}
                      onClick={async () => {
                        if (!address) return
                        setIsFunding(true)
                        try {
                          await fundWallet({
                            address,
                            options: { chain: base, amount: amount || undefined },
                          })
                        } finally {
                          setIsFunding(false)
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#7C9CFF]/50 text-[#7C9CFF] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isFunding ? (
                        <><Loader2 size={18} className="animate-spin" /> Opening payment…</>
                      ) : (
                        <><CreditCard size={18} /> Fund with card / Apple Pay / PayPal</>
                      )}
                    </button>
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
