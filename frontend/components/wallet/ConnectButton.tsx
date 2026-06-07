'use client'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Wallet, User } from 'lucide-react'

export function ConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()

  if (!ready) {
    return (
      <div aria-hidden="true" style={{ opacity: 0, pointerEvents: 'none', userSelect: 'none' }}>
        <button style={{ background: '#F897FE', color: '#060A2A', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-jetbrains-mono), JetBrains Mono, monospace' }}>
          Connect
        </button>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        type="button"
        style={{ background: '#F897FE', color: '#060A2A', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono), JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, transition: 'opacity 160ms' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Connect
      </button>
    )
  }

  const activeWallet = wallets[0]
  const displayAddress = activeWallet?.address
  const displayName = displayAddress
    ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}`
    : user?.email?.address ?? 'Account'

  return (
    <div className="flex items-center gap-2">
      <a
        href="/account"
        style={{ width: 38, height: 38, borderRadius: 99, flexShrink: 0, border: '1px solid rgba(138,143,191,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B8B6D9', textDecoration: 'none', transition: 'border-color 160ms, color 160ms' }}
        title="Account"
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(138,143,191,0.6)'; e.currentTarget.style.color = '#EDEEFF' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(138,143,191,0.2)'; e.currentTarget.style.color = '#B8B6D9' }}
      >
        <User size={18} />
      </a>
      <button
        onClick={logout}
        type="button"
        style={{ background: 'transparent', color: '#B8B6D9', border: '1px solid rgba(138,143,191,0.2)', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-jetbrains-mono), JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, transition: 'border-color 160ms, color 160ms' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(138,143,191,0.5)'; e.currentTarget.style.color = '#EDEEFF' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(138,143,191,0.2)'; e.currentTarget.style.color = '#B8B6D9' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 99, background: '#1DB227', boxShadow: '0 0 8px #1DB227', display: 'inline-block', flexShrink: 0 }} />
        <span className="hidden sm:inline">{displayName}</span>
      </button>
    </div>
  )
}
