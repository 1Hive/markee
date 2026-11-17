'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { AccountButton, ConnectButton } from '@/components/wallet/ConnectButton'
import { MarkeeBalance } from '@/components/wallet/MarkeeBalance'
import { LiveDot } from '@/components/ui/LiveDot'
import { GREEN } from '@/lib/design-tokens'

interface HeaderProps {
  activePage?: string
  useRegularLinks?: boolean
}

const NAV = [
  { label: 'Marketplace', href: '/marketplace', key: 'marketplace' },
  { label: 'Raise Funding', href: '/raise-funding', key: 'raise' },
  { label: 'Own the Network', href: '/own-the-network', key: 'own' },
] as const

// Promo pill for the 1Hive incentives campaign (/1hive). Remove when the campaign ends.
const PROMO = { label: 'Earn up to $1k/mo', href: '/1hive', key: '1hive' } as const

const PromoPill = ({ active, onClick, useRegularLinks }: { active: boolean; onClick?: () => void; useRegularLinks?: boolean }) => {
  const className = `inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-[13px] font-semibold text-[#EDEEFF] transition-colors duration-[140ms] ${active ? 'border-[#F897FE]/60 bg-[#F897FE]/10' : 'border-[#7B6AF4]/40 bg-[#7B6AF4]/15 hover:border-[#F897FE]/50'}`
  const content = <><LiveDot color={GREEN} />{PROMO.label}</>
  if (useRegularLinks) return <a href={PROMO.href} className={className} onClick={onClick}>{content}</a>
  return <Link href={PROMO.href} className={className} onClick={onClick}>{content}</Link>
}

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

  return (
    <header
      className="sticky top-0 z-50 border-b border-[#8A8FBF]/20"
      style={{ background: 'rgba(10,15,61,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7 py-[14px]">
          {LogoLink}

          <nav className="hidden md:flex items-center gap-[26px]">
            {NAV.map((n) => (
              <NavLink key={n.key} href={n.href} active={activePage === n.key} useRegularLinks={useRegularLinks}>
                {n.label}
              </NavLink>
            ))}
            <span className="hidden lg:inline-flex">
              <PromoPill active={activePage === PROMO.key} useRegularLinks={useRegularLinks} />
            </span>
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <MarkeeBalance />
            </div>
            <AccountButton />
            <ConnectButton compactOnPhone />
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
              <PromoPill active={activePage === PROMO.key} onClick={() => setMobileMenuOpen(false)} useRegularLinks={useRegularLinks} />
            </nav>
            <div className="sm:hidden mt-4 flex">
              <MarkeeBalance />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
