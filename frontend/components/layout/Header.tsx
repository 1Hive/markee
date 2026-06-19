'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { EthBalance } from '@/components/wallet/EthBalance'

interface HeaderProps {
  activePage?: string
  useRegularLinks?: boolean
}

const NAV = [
  { label: 'Marketplace', href: '/marketplace', key: 'marketplace' },
  { label: 'Raise Funding', href: '/raise-funding', key: 'raise' },
  { label: 'Own the Network', href: '/own-the-network', key: 'own' },
] as const

const NavLink = ({ href, active, children, onClick, useRegularLinks }: {
  href: string
  active: boolean
  children: React.ReactNode
  onClick?: () => void
  useRegularLinks?: boolean
}) => {
  const className = `text-sm font-${active ? 'semibold' : 'medium'} transition-colors duration-[140ms] ${active ? 'text-[#F897FE]' : 'text-[#B8B6D9] hover:text-[#EDEEFF]'}`
  if (useRegularLinks) return <a href={href} className={className} onClick={onClick}>{children}</a>
  return <Link href={href} className={className} onClick={onClick}>{children}</Link>
}

export function Header({ activePage = 'home', useRegularLinks = false }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const LogoLink = useRegularLinks
    ? <a href="/" aria-label="Markee home" className="flex-shrink-0"><img src="/markee-logo-purple.png" alt="Markee" className="w-[30px] h-[30px] rounded-[7px] block" /></a>
    : <Link href="/" aria-label="Markee home" className="flex-shrink-0"><img src="/markee-logo-purple.png" alt="Markee" className="w-[30px] h-[30px] rounded-[7px] block" /></Link>

  const AccountLink = useRegularLinks
    ? <a href="/account" aria-label="Account" className="w-[38px] h-[38px] rounded-full border border-[#8A8FBF]/20 flex items-center justify-center text-[#B8B6D9] flex-shrink-0 transition-colors hover:border-[rgba(248,151,254,0.35)] hover:text-[#EDEEFF]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></a>
    : <Link href="/account" aria-label="Account" className="w-[38px] h-[38px] rounded-full border border-[#8A8FBF]/20 flex items-center justify-center text-[#B8B6D9] flex-shrink-0 transition-colors hover:border-[rgba(248,151,254,0.35)] hover:text-[#EDEEFF]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></Link>

  return (
    <header
      className="sticky top-0 z-50 border-b border-[#8A8FBF]/20"
      style={{ background: 'rgba(10,15,61,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7 py-[14px]">
          {LogoLink}

          <nav className="hidden md:flex gap-[26px]">
            {NAV.map((n) => (
              <NavLink key={n.key} href={n.href} active={activePage === n.key} useRegularLinks={useRegularLinks}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <EthBalance />
            {AccountLink}
            <ConnectButton />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-[#8A8FBF] hover:text-[#F897FE] p-2 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-[#8A8FBF]/20 pt-4">
            <nav className="flex flex-col gap-4">
              {NAV.map((n) => (
                <NavLink key={n.key} href={n.href} active={activePage === n.key} onClick={() => setMobileMenuOpen(false)} useRegularLinks={useRegularLinks}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
