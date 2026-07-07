'use client'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useState } from 'react'
import { Check, ChevronDown, Copy, LogOut, User, Wallet } from 'lucide-react'

export function ConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!ready) {
    return (
      <div
        aria-hidden="true"
        style={{ opacity: 0, pointerEvents: 'none', userSelect: 'none' }}
      >
        <button className="bg-[#7C9CFF] text-[#060A2A] px-6 py-2 rounded-lg font-medium flex items-center gap-2">
          <Wallet size={20} />
        </button>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        type="button"
        className="bg-[#7C9CFF] text-[#060A2A] px-6 py-2 rounded-lg font-medium hover:bg-[#F897FE] flex items-center gap-2 transition-colors"
      >
        <Wallet size={20} />
        <span className="hidden sm:inline">Connect</span>
      </button>
    )
  }

  // Resolve display name: wallet address > email > name
  const activeWallet = wallets[0]
  const displayAddress = activeWallet?.address
  const displayName = displayAddress
    ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}`
    : user?.email?.address ?? 'Account'

  const copyAddress = async () => {
    if (!displayAddress) return
    await navigator.clipboard.writeText(displayAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDisconnect = async () => {
    setMenuOpen(false)
    await logout()
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="/account"
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#0A0F3D] border border-[#8A8FBF]/30 text-[#8A8FBF] hover:text-[#F897FE] hover:border-[#F897FE]/60 transition-colors"
        title="My Markees"
      >
        <User size={18} />
      </a>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(open => !open)}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="bg-[#7C9CFF] text-[#060A2A] px-4 py-2 rounded-lg font-medium hover:bg-[#F897FE] flex items-center gap-2 transition-colors"
        >
          <Wallet size={20} />
          <span className="hidden sm:inline">{displayName}</span>
          <ChevronDown size={16} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close account menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenuOpen(false)}
              tabIndex={-1}
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-[#8A8FBF]/30 bg-[#0A0F3D] shadow-xl"
            >
              {displayAddress && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={copyAddress}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-[#EDEEFF] hover:bg-[#8A8FBF]/10 transition-colors"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-[#8A8FBF]" />}
                  <span>{copied ? 'Copied address' : 'Copy address'}</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleDisconnect}
                className="flex w-full items-center gap-2 border-t border-[#8A8FBF]/15 px-4 py-3 text-left text-sm text-[#FF8E8E] hover:bg-[#FF8E8E]/10 transition-colors"
              >
                <LogOut size={16} />
                <span>Disconnect</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
