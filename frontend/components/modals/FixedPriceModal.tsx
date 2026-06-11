'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { formatEther } from 'viem'
import { X, Loader2, CheckCircle2, AlertCircle, ArrowRightLeft, CreditCard } from 'lucide-react'
import { usePrivy, useFundWallet } from '@privy-io/react-auth'
import { FixedPriceStrategyABI } from '@/lib/contracts/abis'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { useEthPrice } from '@/hooks/useEthPrice'
import { formatUsd } from '@/lib/utils'
import type { FixedMarkee } from '@/lib/contracts/useFixedMarkees'

interface FixedPriceModalProps {
  isOpen: boolean
  onClose: () => void
  fixedMarkee: FixedMarkee | null
  onSuccess?: () => void
}

export function FixedPriceModal({
  isOpen,
  onClose,
  fixedMarkee,
  onSuccess
}: FixedPriceModalProps) {
  const { authenticated } = usePrivy()
  const { isConnected, chain, address } = useAccount()
  const { switchChain } = useSwitchChain()
  const ethPrice = useEthPrice()

  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: address,
    chainId: CANONICAL_CHAIN.id,
  })

  const { fundWallet } = useFundWallet({
    onUserExited: () => { refetchBalance() },
  })

  const isCorrectChain = chain?.id === CANONICAL_CHAIN.id

  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const {
    writeContract,
    data: hash,
    isPending,
    isError,
    error: writeError,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // All price data comes from the hook — no RPC calls here
  const priceWei: bigint = fixedMarkee?.priceWei ? BigInt(fixedMarkee.priceWei) : 0n
  const priceEth: string = formatEther(priceWei)
  const priceEthNum = parseFloat(priceEth)
  const priceUsd = ethPrice && priceWei > 0n ? priceEthNum * ethPrice : null
  const priceDisplay = priceWei > 0n ? (priceUsd ? formatUsd(priceUsd) : `${priceEth} ETH`) : '...'
  const priceSubDisplay = priceUsd ? `${priceEth} ETH` : null
  const revNetEnabled = fixedMarkee?.revNetEnabled ?? false
  const markeeTokens = revNetEnabled && priceWei > 0n ? parseFloat(priceEth) * 62000 : 0
  const maxLength = fixedMarkee?.maxMessageLength ?? null

  useEffect(() => {
    if (isOpen && fixedMarkee) {
      setNewMessage('')
      setError(null)
      reset()
    }
  }, [isOpen, fixedMarkee, reset])

  useEffect(() => {
    if (isSuccess && isOpen) {
      setTimeout(() => {
        if (onSuccess) onSuccess()
        onClose()
      }, 2000)
    }
  }, [isSuccess, onClose, isOpen])

  const canAffordMessage = (): boolean => {
    if (!balanceData || priceWei === 0n) return false
    const estimatedGas = 1000000000000000n // 0.001 ETH
    return balanceData.value >= priceWei + estimatedGas
  }

  const getInsufficientBalanceMessage = (): string | null => {
    if (!balanceData || priceWei === 0n) return null
    const estimatedGas = 1000000000000000n
    if (balanceData.value < priceWei + estimatedGas) {
      return `You don't have enough ETH to complete this transaction.`
    }
    return null
  }

  const handleChangeMessage = async () => {
    if (!fixedMarkee || !chain) { setError('Please connect your wallet'); return }
    if (chain.id !== CANONICAL_CHAIN.id) { setError(`Please switch to ${CANONICAL_CHAIN.name}`); return }
    if (!newMessage.trim()) { setError('Please enter a message'); return }
    if (priceWei === 0n) { setError('Unable to load price'); return }
    if (maxLength && newMessage.length > maxLength) {
      setError(`Message exceeds maximum length of ${maxLength} characters`)
      return
    }
    if (!canAffordMessage()) {
      setError(getInsufficientBalanceMessage() || 'Insufficient balance')
      return
    }

    setError(null)
    try {
      writeContract({
        address: fixedMarkee.strategyAddress as `0x${string}`,
        abi: FixedPriceStrategyABI,
        functionName: 'changeMessage',
        args: [newMessage, ''],
        value: priceWei,  // raw BigInt — exact, no precision loss
        chainId: CANONICAL_CHAIN.id,
      })
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    }
  }

  if (!isOpen || !fixedMarkee) return null

  const insufficientBalance = !canAffordMessage()
  const balanceWarning = getInsufficientBalanceMessage()
  const currentLength = newMessage.length
  const isOverLimit = !!(maxLength && currentLength > maxLength)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-gradient-to-br from-[#0A0F3D] to-[#060A2A] border border-[#8A8FBF]/30 rounded-xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors" disabled={isPending || isConfirming}>
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">Message updated!</p>
            <p className="text-[#8A8FBF] text-sm text-center">Your new message is now live.</p>
          </div>
        ) : (
          <>
            <h2 className="text-[#EDEEFF] font-bold text-lg mb-6">Change Message</h2>

            {!isConnected ? (
              <div className="space-y-4">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to change this message.</p>
                <div className="flex justify-center"><ConnectButton /></div>
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
                {/* Current message */}
                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15">
                  <div className="text-[#8A8FBF] text-xs mb-1 uppercase tracking-wider">Current message</div>
                  <p className="text-[#EDEEFF] font-mono text-sm">{fixedMarkee.message || 'No message yet'}</p>
                </div>

                {/* Price + MARKEE received */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15">
                    <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Price to change</div>
                    <p className="text-2xl font-bold text-[#F897FE]">{priceDisplay}</p>
                    {priceSubDisplay && <p className="text-xs text-[#8A8FBF] mt-0.5">{priceSubDisplay}</p>}
                    {balanceData && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#8A8FBF]/15">
                        <span className="text-[#8A8FBF] text-xs">Your balance</span>
                        <div className="text-right">
                          <p className="text-xs font-medium text-[#EDEEFF]">{parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH</p>
                          {ethPrice && <p className="text-xs text-[#7C9CFF]">{formatUsd(parseFloat(formatEther(balanceData.value)) * ethPrice)}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                  {markeeTokens > 0 && (
                    <div className="flex-1 bg-gradient-to-br from-[#F897FE]/20 to-[#7B6AF4]/20 rounded-lg p-4 border border-[#F897FE]/40 flex flex-col justify-center items-center text-center">
                      <p className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">You'll receive</p>
                      <p className="text-2xl font-bold text-[#F897FE]">{markeeTokens.toLocaleString()}</p>
                      <p className="text-sm text-[#B8B6D9] mt-1">MARKEE tokens</p>
                    </div>
                  )}
                </div>

                {/* New message */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[#8A8FBF] text-xs uppercase tracking-wider">New Message</label>
                    {maxLength && (
                      <span className={`text-xs ${isOverLimit ? 'text-red-400' : 'text-[#8A8FBF]'}`}>
                        {currentLength}/{maxLength}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Write your new message…"
                    rows={3}
                    className={`w-full bg-[#060A2A] border focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm font-mono outline-none transition-colors resize-none ${isOverLimit ? 'border-red-500/50' : 'border-[#8A8FBF]/20'}`}
                    disabled={isPending || isConfirming}
                  />
                </div>

                {/* Insufficient balance */}
                {insufficientBalance && balanceWarning && !error && !isError && (
                  <div className="space-y-2">
                    <p className="text-xs text-[#8A8FBF] text-center">{balanceWarning}</p>
                    {authenticated && address && (
                      <button
                        onClick={async () => {
                          try {
                            await fundWallet({ address, options: { chain: CANONICAL_CHAIN, amount: priceEth } })
                          } catch (e: any) {
                            setError(e?.message || 'Card funding is not available. Please fund your wallet manually.')
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-[#0A0F3D] border border-[#7C9CFF]/50 text-[#7C9CFF] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF]/10 transition-colors"
                      >
                        <CreditCard size={18} />
                        Fund with card / Apple Pay / PayPal
                      </button>
                    )}
                  </div>
                )}

                {/* Errors */}
                {(error || isError) && (
                  <div className="flex items-start gap-2 text-red-400 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error || writeError?.message}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleChangeMessage}
                  disabled={isPending || isConfirming || !newMessage.trim() || insufficientBalance || isOverLimit}
                  className="w-full flex items-center justify-center gap-2 bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending || isConfirming ? (
                    <><Loader2 size={18} className="animate-spin" /> {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}</>
                  ) : (
                    `Change Message · ${priceDisplay}`
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
