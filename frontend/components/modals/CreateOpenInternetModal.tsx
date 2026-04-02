'use client'

import { useState, useEffect } from 'react'
import { X, Globe, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { ConnectButton } from '@/components/wallet/ConnectButton'

const OI_FACTORY_ADDRESS = '0x3f9f7C070f03167C0A90Ee7C2c5863d6F15F7E6D' as const

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

interface CreateOpenInternetModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CreateOpenInternetModal({ isOpen, onClose, onSuccess }: CreateOpenInternetModalProps) {
  const { isConnected } = useAccount()
  const [name, setName] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newLeaderboardAddress, setNewLeaderboardAddress] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isOpen) {
      setName('')
      setBeneficiary('')
      setLogoUrl('')
      setSiteUrl('')
      setError(null)
      setNewLeaderboardAddress(null)
      reset()
    }
  }, [isOpen, reset])

  useEffect(() => {
    if (!isSuccess || !receipt) return

    let foundAddress: string | null = null
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === OI_FACTORY_ADDRESS.toLowerCase() &&
        log.topics[1]
      ) {
        foundAddress = `0x${log.topics[1].slice(26)}`
        break
      }
    }
    setNewLeaderboardAddress(foundAddress)

    // Post optional metadata to KV
    if (foundAddress && (logoUrl.trim() || siteUrl.trim())) {
      fetch('/api/openinternet/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderboardAddress: foundAddress,
          ...(logoUrl.trim() && { logoUrl: logoUrl.trim() }),
          ...(siteUrl.trim() && { siteUrl: siteUrl.trim() }),
        }),
      }).catch(e => console.error('[CreateOpenInternetModal] meta POST failed:', e))
    }

    onSuccess?.()
  }, [isSuccess, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    setError(null)
    if (!name.trim()) { setError('Enter a name for your sign.'); return }
    if (!beneficiary || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)) {
      setError('Enter a valid treasury address.')
      return
    }
    writeContract({
      address: OI_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createLeaderboard',
      args: [beneficiary as `0x${string}`, name.trim()],
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={44} className="text-green-400" />
            <p className="text-[#EDEEFF] font-bold text-xl">Markee created!</p>
            <p className="text-[#8A8FBF] text-sm text-center">
              Your sign is live. Once you add a message it will appear in the ecosystem.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-[#F897FE] text-[#060A2A] font-semibold px-6 py-3 rounded-lg hover:bg-[#7C9CFF] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                <Globe size={20} className="text-[#F897FE]" />
              </div>
              <div>
                <h2 className="text-[#EDEEFF] font-bold text-lg">Create a Markee for your Website</h2>
                <p className="text-[#8A8FBF] text-xs">Anyone can pay to change the message on your site</p>
              </div>
            </div>

            {!isConnected ? (
              <div className="space-y-3">
                <p className="text-[#8A8FBF] text-sm">Connect your wallet to continue.</p>
                <ConnectButton />
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Website Name <span className="text-[#F897FE]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. My Website"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
                    disabled={isPending || isConfirming}
                  />
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
                    disabled={isPending || isConfirming}
                  />
                  <p className="text-[#8A8FBF] text-xs mt-1.5">62% of every payment goes here.</p>
                </div>

                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Site URL <span className="text-[#8A8FBF]/60">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={e => setSiteUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
                    disabled={isPending || isConfirming}
                  />
                </div>

                <div>
                  <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
                    Logo URL <span className="text-[#8A8FBF]/60">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={e => setLogoUrl(e.target.value)}
                    placeholder="https://yoursite.com/logo.png"
                    className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
                    disabled={isPending || isConfirming}
                  />
                </div>

                <div className="bg-[#060A2A] rounded-lg p-4 border border-[#8A8FBF]/15 text-sm">
                  <div className="text-[#8A8FBF] text-xs mb-3 uppercase tracking-wider">Revenue split</div>
                  <div className="flex justify-between">
                    <span className="text-[#EDEEFF]">Your Treasury</span>
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
                  className="w-full bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {isPending ? 'Confirm in wallet…' : 'Creating…'}
                    </>
                  ) : (
                    'Create Markee'
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
