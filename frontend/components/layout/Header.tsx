'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { EthBalance } from '@/components/wallet/EthBalance'

interface HeaderProps {
  activePage?: 'home' | 'marketplace' | 'raise' | 'own'
  useRegularLinks?: boolean
}

const NAV = [
  { label: 'Marketplace', href: '/ecosystem', key: 'marketplace' },
  { label: 'Raise Funding', href: '/raise-funding', key: 'raise' },
  { label: 'Own the Network', href: '/owners', key: 'own' },
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

  return (
    <header
      className="sticky top-0 z-50 border-b border-[#8A8FBF]/20"
      style={{ background: 'rgba(10,15,61,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7 py-[14px]">
          {/* Logo */}
          {useRegularLinks ? (
            <a href="/" aria-label="Markee home" className="flex-shrink-0">
              <img src="/markee-logo.png" alt="Markee" className="w-[30px] h-[30px] rounded-[7px] block" />
            </a>
          ) : (
            <Link href="/" aria-label="Markee home" className="flex-shrink-0">
              <img src="/markee-logo.png" alt="Markee" className="w-[30px] h-[30px] rounded-[7px] block" />
            </Link>
          )}

          {/* Desktop nav */}
          <nav className="hidden md:flex gap-[26px]">
            {NAV.map((n) => (
              <NavLink key={n.key} href={n.href} active={activePage === n.key} useRegularLinks={useRegularLinks}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3">
            <EthBalance />
            <ConnectButton />

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-[#B8B6D9] hover:text-[#F897FE] p-2"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
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
