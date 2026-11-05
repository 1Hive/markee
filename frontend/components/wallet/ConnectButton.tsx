'use client'
import Link from 'next/link'
import { usePrivy, useWallets, useConnectWallet } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'
import { ChevronDown, LogOut, RefreshCw, User } from 'lucide-react'
import { useModerationQueue } from '@/hooks/useModerationQueue'

const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BORDER = 'rgba(138,143,191,0.2)'

function QueueBadge({ n }: { n: number }) {
  return (
    <span
      aria-label={`${n} messages to review`}
      style={{
        minWidth: 18, height: 18, borderRadius: 99, padding: '0 5px', boxSizing: 'border-box',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: '#FFB020', color: '#060A2A', fontSize: 10, fontWeight: 700, fontFamily: MONO,
      }}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

function GlowDot() {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: 99, flexShrink: 0, display: 'inline-block',
      background: '#1DB227', boxShadow: '0 0 6px #1DB227',
    }} />
  )
}

// Circular account icon button — sits to the left of ConnectButton in the header.
// Shows the moderation queue badge and links to /account. Only renders when authenticated.
export function AccountButton() {
  const { authenticated, ready } = usePrivy()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const { items: queueItems } = useModerationQueue()

  if (!mounted || !ready || !authenticated) return null

  return (
    <Link
      href="/account"
      aria-label="Account"
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, borderRadius: 99, flexShrink: 0,
        border: `1px solid ${BORDER}`, background: 'transparent',
        color: '#8A8FBF', textDecoration: 'none',
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
        el.style.color = '#8A8FBF'
      }}
    >
      <User size={17} />
      {queueItems.length > 0 && (
        <span style={{ position: 'absolute', top: -4, right: -4 }}>
          <QueueBadge n={queueItems.length} />
        </span>
      )}
    </Link>
  )
}

export function ConnectButton() {
  const { authenticated, ready, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { connectWallet } = useConnectWallet()
  const { address } = useAccount()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const { items: queueItems } = useModerationQueue()

  // Before Privy finishes checking for a stored session, `authenticated` just defaults to false --
  // showing "Connect" here would read as "you're logged out" when the real answer is "still checking."
  // A neutral pulsing placeholder (sized like the real button, so nothing shifts once it resolves)
  // avoids that false flash on every fresh page load.
  if (!mounted || !ready) {
    return (
      <div
        aria-hidden
        style={{
          width: 92, height: 33, borderRadius: 8,
          background: 'rgba(138,143,191,0.12)',
          animation: 'shimmer 1.4s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
    )
  }

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

  const displayAddress = address ?? wallets[0]?.address
  const displayName = displayAddress
    ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}`
    : user?.email?.address ?? 'Account'

  const handleChangeAccount = () => {
    setMenuOpen(false)
    connectWallet()
  }

  const handleDisconnect = async () => {
    setMenuOpen(false)
    await logout()
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setMenuOpen(open => !open)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
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
        <ChevronDown size={14} style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 160ms' }} />
      </button>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            onClick={() => setMenuOpen(false)}
            tabIndex={-1}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent', border: 0, cursor: 'default' }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50,
              width: 180, overflow: 'hidden', borderRadius: 8,
              border: `1px solid ${BORDER}`, background: '#0A0F3D',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleChangeAccount}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '11px 13px', background: 'transparent', border: 0,
                color: '#EDEEFF', fontFamily: MONO, fontSize: 12,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <RefreshCw size={15} color="#8A8FBF" />
              Change account
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleDisconnect}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '11px 13px', background: 'transparent',
                border: 0, borderTop: `1px solid ${BORDER}`,
                color: '#FF8E8E', fontFamily: MONO, fontSize: 12,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <LogOut size={15} />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  )
}
