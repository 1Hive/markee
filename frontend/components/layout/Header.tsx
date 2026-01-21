'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ConnectButton } from '@/components/wallet/ConnectButton'
import { TokenBalance } from '@/components/wallet/TokenBalance'

interface HeaderProps {
  activePage?: 'home' | 'how-it-works' | 'ecosystem' | 'owners'
  useRegularLinks?: boolean // FIX ATTEMPT #3: Use <a> instead of <Link> for home page only
}

// Define NavLink outside the component - only created once, not on every render
const NavLink = ({ href, active, children, onClick, useRegularLinks }: { 
  href: string
  active: boolean
  children: React.ReactNode
  onClick?: () => void
  useRegularLinks?: boolean
}) => {
  const className = active ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'
  
  if (useRegularLinks) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    )
  }
  
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}

export function Header({ activePage = 'home', useRegularLinks = false }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  return (
    <header className="bg-[#0A0F3D] border-b border-[#8A8FBF]/20" style={{ position: 'relative', zIndex: 50 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            {useRegularLinks ? (
              <a href="/" className="flex items-center">
                <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
              </a>
            ) : (
              <Link href="/" className="flex items-center">
                <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
              </Link>
            )}
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex gap-6">
              <NavLink href="/how-it-works" active={activePage === 'how-it-works'} useRegularLinks={useRegularLinks}>
                How it Works
              </NavLink>
              <NavLink href="/ecosystem" active={activePage === 'ecosystem'} useRegularLinks={useRegularLinks}>
                Ecosystem
              </NavLink>
              <NavLink href="/owners" active={activePage === 'owners'} useRegularLinks={useRegularLinks}>
                Owners
              </NavLink>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <TokenBalance />
            <div className="hidden md:block">
              <ConnectButton />
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-[#B8B6D9] hover:text-[#F897FE] p-2"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-[#8A8FBF]/20 pt-4">
            <nav className="flex flex-col gap-4">
              <NavLink 
                href="/how-it-works" 
                active={activePage === 'how-it-works'}
                onClick={() => setMobileMenuOpen(false)}
                useRegularLinks={useRegularLinks}
              >
                How it Works
              </NavLink>
              <NavLink 
                href="/ecosystem" 
                active={activePage === 'ecosystem'}
                onClick={() => setMobileMenuOpen(false)}
                useRegularLinks={useRegularLinks}
              >
                Ecosystem
              </NavLink>
              <NavLink 
                href="/owners" 
                active={activePage === 'owners'}
                onClick={() => setMobileMenuOpen(false)}
                useRegularLinks={useRegularLinks}
              >
                Owners
              </NavLink>
              <div className="pt-2 border-t border-[#8A8FBF]/20">
                <TokenBalance />
              </div>
              <div className="pt-2">
                <ConnectButton />
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
