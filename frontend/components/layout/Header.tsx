'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ConnectButton } from '@/components/wallet/ConnectButton'

interface HeaderProps {
  activePage?: 'home' | 'how-it-works' | 'ecosystem' | 'owners'
}

export function Header({ activePage = 'home' }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="bg-[#0A0F3D] border-b border-[#8A8FBF]/20" style={{ position: 'relative', zIndex: 9999 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
            </Link>
            {/* Desktop Navigation */}
            <nav className="hidden md:flex gap-6">
              <Link 
                href="/how-it-works" 
                className={activePage === 'how-it-works' ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'}
              >
                How it Works
              </Link>
              <Link 
                href="/ecosystem" 
                className={activePage === 'ecosystem' ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'}
              >
                Ecosystem
              </Link>
              <Link 
                href="/owners" 
                className={activePage === 'owners' ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'}
              >
                Owners
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
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
              <Link 
                href="/how-it-works" 
                className={`py-2 ${activePage === 'how-it-works' ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                How it Works
              </Link>
              <Link 
                href="/ecosystem" 
                className={`py-2 ${activePage === 'ecosystem' ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Ecosystem
              </Link>
              <Link 
                href="/owners" 
                className={`py-2 ${activePage === 'owners' ? 'text-[#F897FE] font-medium' : 'text-[#B8B6D9] hover:text-[#F897FE]'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Owners
              </Link>
              <div className="pt-2 border-t border-[#8A8FBF]/20">
                <ConnectButton />
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
