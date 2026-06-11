'use client'
import { usePrivy, useWallets } from '@privy-io/react-auth'

const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BORDER = 'rgba(138,143,191,0.2)'

function GlowDot() {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: 99, flexShrink: 0, display: 'inline-block',
      background: '#1DB227', boxShadow: '0 0 6px #1DB227',
    }} />
  )
}

export function ConnectButton() {
  const { authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()

  if (!authenticated) {
    return (
      <button
        onClick={login}
        type="button"
        style={{
          background: '#F897FE', color: '#060A2A', border: 'none',
          borderRadius: 8, padding: '9px 18px',
          fontWeight: 600, fontSize: 13, fontFamily: MONO,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        Connect
      </button>
    )
  }

  const displayAddress = wallets[0]?.address
  const displayName = displayAddress
    ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}`
    : user?.email?.address ?? 'Account'

  return (
    <button
      onClick={logout}
      type="button"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent', color: '#B8B6D9',
        border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 14px',
        fontWeight: 600, fontSize: 13, fontFamily: MONO,
        cursor: 'pointer', flexShrink: 0,
        transition: 'border-color 160ms, color 160ms',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'rgba(248,151,254,0.35)'
        el.style.color = '#EDEEFF'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = BORDER
        el.style.color = '#B8B6D9'
      }}
    >
      <GlowDot />
      {displayName}
    </button>
  )
}
