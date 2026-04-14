'use client'

import { useState } from 'react'
import { X, CheckCircle2, AlertCircle, Loader2, ExternalLink, Globe2 } from 'lucide-react'

interface VerifyIntegrationModalProps {
  isOpen: boolean
  onClose: () => void
  leaderboard: {
    address: string
    name: string
    verifiedUrls?: string[]
  }
  onVerified?: (verifiedUrls: string[]) => void
  onOpenIntegration?: () => void
}

export function VerifyIntegrationModal({
  isOpen,
  onClose,
  leaderboard,
  onVerified,
  onOpenIntegration,
}: VerifyIntegrationModalProps) {
  const [verifyUrl, setVerifyUrl] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [localVerifiedUrls, setLocalVerifiedUrls] = useState<string[]>(leaderboard.verifiedUrls ?? [])

  if (!isOpen) return null

  async function handleVerify() {
    if (!verifyUrl.trim()) return
    setVerifyError(null)
    setVerifying(true)
    try {
      const res = await fetch('/api/openinternet/verify-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: leaderboard.address, url: verifyUrl.trim() }),
      })
      const data = await res.json()
      if (data.verified) {
        const urls: string[] = data.verifiedUrls ?? [...localVerifiedUrls, verifyUrl.trim()]
        setLocalVerifiedUrls(urls)
        setVerifyUrl('')
        onVerified?.(urls)
      } else {
        setVerifyError(data.error ?? 'Verification failed')
      }
    } catch {
      setVerifyError('Something went wrong - please try again')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-7 max-w-lg w-full shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20 flex-shrink-0">
            <Globe2 size={17} className="text-[#F897FE]" />
          </div>
          <div>
            <h2 className="text-[#EDEEFF] font-bold text-base">Verify Integration</h2>
            <p className="text-[#8A8FBF] text-xs truncate">{leaderboard.name}</p>
          </div>
        </div>

        {localVerifiedUrls.length > 0 && (
          <div className="mb-5">
            <p className="text-[#8A8FBF] text-xs uppercase tracking-wider mb-2">Verified sites</p>
            <div className="space-y-1.5">
              {localVerifiedUrls.map(url => (
                <div key={url} className="flex items-center gap-2 bg-[#060A2A] rounded-lg px-3 py-2 border border-[#1DB227]/20">
                  <CheckCircle2 size={13} className="text-[#1DB227] flex-shrink-0" />
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#8A8FBF] text-xs hover:text-[#F897FE] transition-colors truncate flex-1"
                  >
                    {url}
                  </a>
                  <ExternalLink size={11} className="text-[#8A8FBF] flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
              Your site URL
            </label>
            <input
              type="url"
              value={verifyUrl}
              onChange={e => { setVerifyUrl(e.target.value); setVerifyError(null) }}
              placeholder="https://yoursite.com"
              className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
              disabled={verifying}
              onKeyDown={e => { if (e.key === 'Enter') handleVerify() }}
            />
          </div>

          {verifyError && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <div>
                <span>{verifyError}</span>
                {verifyError.toLowerCase().includes('not detected') && (
                  <p className="text-[#8A8FBF] text-xs mt-1.5 leading-relaxed">
                    The verifier checks the raw HTML from the server, not JavaScript-rendered content. If your site is a client-side app (Create React App, Vite), add <code className="font-mono bg-[#060A2A] px-1 rounded">data-markee-address</code> to a static element in your <code className="font-mono bg-[#060A2A] px-1 rounded">index.html</code> instead of relying on React to render it.
                  </p>
                )}
                {onOpenIntegration && (
                  <button
                    onClick={onOpenIntegration}
                    className="block text-[#8A8FBF] hover:text-[#F897FE] text-xs mt-1 transition-colors underline"
                  >
                    View integration guide
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={verifying || !verifyUrl.trim()}
            className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {verifying ? (
              <><Loader2 size={15} className="animate-spin" /> Checking...</>
            ) : (
              'Verify Integration'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
