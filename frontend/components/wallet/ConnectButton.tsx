'use client'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Wallet, User } from 'lucide-react'

export function ConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()

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

  return (
    <div className="flex items-center gap-2">
      <a
        href="/account"
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#0A0F3D] border border-[#8A8FBF]/30 text-[#8A8FBF] hover:text-[#F897FE] hover:border-[#F897FE]/60 transition-colors"
        title="My Markees"
      >
        <User size={18} />
      </a>
      <button
        onClick={logout}
        type="button"
        className="bg-[#7C9CFF] text-[#060A2A] px-4 py-2 rounded-lg font-medium hover:bg-[#F897FE] flex items-center gap-2 transition-colors"
      >
        <Wallet size={20} />
        <span className="hidden sm:inline">{displayName}</span>
      </button>
    </div>
  )
}
