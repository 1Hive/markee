'use client'

import Link from 'next/link'
import { ChevronRight, Github, Zap } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

const PLATFORMS = [
  {
    slug: 'github',
    name: 'GitHub — SKILL.md',
    description: 'Context window advertising for open source repos. Your SKILL.md gets read by every AI agent that touches your codebase.',
    icon: Github,
    iconColor: 'text-[#EDEEFF]',
    status: 'live' as const,
    detail: 'Agent-native impressions',
  },
  {
    slug: 'superfluid',
    name: 'Superfluid — Season 5',
    description: 'Superfluid ecosystem projects earn rewards by hosting a Markee sign. No setup required — deploy in seconds.',
    icon: Zap,
    iconColor: 'text-[#1DB227]',
    status: 'live' as const,
    detail: 'Ecosystem rewards',
  },
]

export default function PlatformsPage() {
  return (
    <div className="min-h-screen bg-[#060A2A]">
      <Header activePage="ecosystem" />

      {/* Breadcrumbs */}
      <section className="bg-[#0A0F3D] py-4 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/ecosystem" className="text-[#8A8FBF] hover:text-[#F897FE] transition-colors">
              Ecosystem
            </Link>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">Platforms</span>
          </div>
        </div>
      </section>

      {/* Header */}
      <section className="bg-[#0A0F3D] py-12 border-b border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-[#EDEEFF] mb-2">Platforms</h1>
          <p className="text-[#8A8FBF] max-w-2xl">
            Markee integrations that write directly to files and surfaces across the open internet — not just websites.
          </p>
        </div>
      </section>

      {/* Platform list */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLATFORMS.map(platform => {
              const Icon = platform.icon
              return (
                <Link
                  key={platform.slug}
                  href={`/ecosystem/platforms/${platform.slug}`}
                  className="group bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE]/40 transition-all p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#060A2A] border border-[#8A8FBF]/20">
                      <Icon size={24} className={platform.iconColor} />
                    </div>
                    {platform.status === 'live' && (
                      <span className="flex items-center gap-1.5 bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE] text-xs font-semibold px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F897FE] animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  <h3 className="text-[#EDEEFF] font-semibold mb-2 group-hover:text-[#F897FE] transition-colors">
                    {platform.name}
                  </h3>
                  <p className="text-[#8A8FBF] text-sm mb-4">{platform.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7C9CFF] text-xs">{platform.detail}</span>
                    <ChevronRight size={16} className="text-[#8A8FBF] group-hover:text-[#F897FE] transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
