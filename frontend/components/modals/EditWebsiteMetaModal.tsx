'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface EditWebsiteMetaModalProps {
  isOpen: boolean
  onClose: () => void
  leaderboardAddress: string
  initialSiteUrl?: string | null
  initialLogoUrl?: string | null
  onSuccess?: () => void
}

export function EditWebsiteMetaModal({
  isOpen,
  onClose,
  leaderboardAddress,
  initialSiteUrl,
  initialLogoUrl,
  onSuccess,
}: EditWebsiteMetaModalProps) {
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl ?? '')
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSiteUrl(initialSiteUrl ?? '')
      setLogoUrl(initialLogoUrl ?? '')
      setSaved(false)
      setError(null)
    }
  }, [isOpen, initialSiteUrl, initialLogoUrl])

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const res = await fetch('/api/openinternet/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderboardAddress,
          ...(siteUrl.trim() && { siteUrl: siteUrl.trim() }),
          ...(logoUrl.trim() && { logoUrl: logoUrl.trim() }),
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      onSuccess?.()
      setTimeout(onClose, 1500)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0A0F3D] border border-[#8A8FBF]/30 rounded-2xl p-7 max-w-sm w-full shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8A8FBF] hover:text-[#EDEEFF] transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-[#EDEEFF] font-bold text-lg mb-1">Edit Website Info</h2>
        <p className="text-[#8A8FBF] text-xs mb-6">
          Update your site URL or logo. Changes appear on the ecosystem page.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
              Site URL
            </label>
            <input
              type="url"
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
              disabled={isSaving || saved}
            />
          </div>

          <div>
            <label className="block text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">
              Logo URL
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://yoursite.com/logo.png"
              className="w-full bg-[#060A2A] border border-[#8A8FBF]/20 focus:border-[#F897FE]/50 rounded-lg px-4 py-3 text-[#EDEEFF] text-sm outline-none transition-colors"
              disabled={isSaving || saved}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || saved || (!siteUrl.trim() && !logoUrl.trim())}
            className="w-full bg-[#F897FE] text-[#060A2A] px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#7C9CFF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saved ? (
              <><CheckCircle2 size={16} /> Saved!</>
            ) : isSaving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving…</>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
