'use client'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState } from 'react'
import { Check, ChevronDown, Copy, LayoutDashboard, LogOut } from 'lucide-react'

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
  const { address } = useAccount()
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

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
              width: 210, overflow: 'hidden', borderRadius: 8,
              border: `1px solid ${BORDER}`, background: '#0A0F3D',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            }}
          >
            <a
              href="/account"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '11px 13px', background: 'transparent', border: 0,
                color: '#EDEEFF', fontFamily: MONO, fontSize: 12,
                cursor: 'pointer', textAlign: 'left', textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              <LayoutDashboard size={15} color="#8A8FBF" />
              Dashboard
            </a>
            {displayAddress && (
              <button
                type="button"
                role="menuitem"
                onClick={copyAddress}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '11px 13px', background: 'transparent', border: 0,
                  borderTop: `1px solid ${BORDER}`,
                  color: '#EDEEFF', fontFamily: MONO, fontSize: 12,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {copied ? <Check size={15} color="#1DB227" /> : <Copy size={15} color="#8A8FBF" />}
                {copied ? 'Copied address' : 'Copy address'}
              </button>
            )}
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
