'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, Github, GitFork, Star, ExternalLink, Zap } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { HeroBackground } from '@/components/backgrounds/HeroBackground'

// Shape of a connected repo returned by /api/github/repos
interface GithubRepo {
  id: number
  owner: string
  repo: string
  fullName: string
  description: string | null
  stars: number
  forks: number
  avatarUrl: string
  contractAddress: string | null
  topMessage: string | null
  topBidder: string | null
  installedAt: string
}

export default function GithubPlatformPage() {
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchRepos = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/github/repos')
      if (res.ok) {
        const data = await res.json()
        setRepos(data.repos ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch GitHub repos:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  const handleConnect = () => {
    window.location.href = '/api/github/connect'
  }

  const liveRepos = repos.filter(r => !!r.contractAddress)
  const pendingRepos = repos.filter(r => !r.contractAddress)

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
            <span className="text-[#8A8FBF]">Platforms</span>
            <ChevronRight size={16} className="text-[#8A8FBF]" />
            <span className="text-[#EDEEFF]">GitHub</span>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <HeroBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0A0F3D] border border-[#8A8FBF]/30">
                <Github size={32} className="text-[#EDEEFF]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-[#EDEEFF] mb-2">GitHub — SKILL.md</h1>
                <p className="text-[#8A8FBF] max-w-xl">
                  Context window advertising for open source repos. Your SKILL.md gets read by every AI agent that touches your codebase.
                </p>
              </div>
            </div>

            <button
              onClick={handleConnect}
              className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors whitespace-nowrap"
            >
              <Github size={18} />
              Connect a Repo
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-8 mt-10">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-[#F897FE] animate-pulse" />
              <span className="text-[#F897FE] font-semibold">{liveRepos.length}</span>
              <span className="text-[#8A8FBF]">live repos</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Zap size={14} className="text-[#7C9CFF]" />
              <span className="text-[#7C9CFF] font-semibold">Agent-native</span>
              <span className="text-[#8A8FBF]">impressions</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 bg-[#0A0F3D] border-y border-[#8A8FBF]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-sm font-bold">1</div>
              <div>
                <h3 className="text-[#EDEEFF] font-semibold mb-1">Connect your repo</h3>
                <p className="text-[#8A8FBF] text-sm">Authorize the Markee GitHub App with write access to your SKILL.md file.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-sm font-bold">2</div>
              <div>
                <h3 className="text-[#EDEEFF] font-semibold mb-1">Add the delimiters</h3>
                <p className="text-[#8A8FBF] text-sm">Drop <code className="text-[#7C9CFF] text-xs">{'<!-- MARKEE:START -->'}</code> and <code className="text-[#7C9CFF] text-xs">{'<!-- MARKEE:END -->'}</code> into your SKILL.md.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F897FE]/15 border border-[#F897FE]/40 flex items-center justify-center text-[#F897FE] text-sm font-bold">3</div>
              <div>
                <h3 className="text-[#EDEEFF] font-semibold mb-1">Earn on every bid</h3>
                <p className="text-[#8A8FBF] text-sm">The leaderboard updates automatically. 62% of every payment flows to your repo treasury.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Repo grid */}
      <section className="py-16 bg-[#060A2A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#0A0F3D] rounded-lg p-8 border border-[#8A8FBF]/20 animate-pulse">
                  <div className="h-48 bg-[#1A1F4D] rounded" />
                </div>
              ))}
            </div>
          ) : repos.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-[#0A0F3D] rounded-2xl p-12 max-w-lg mx-auto border border-[#8A8FBF]/20">
                <Github size={48} className="text-[#8A8FBF] mx-auto mb-4" />
                <h2 className="text-xl font-bold text-[#EDEEFF] mb-3">No repos connected yet</h2>
                <p className="text-[#8A8FBF] mb-6 text-sm">
                  Be the first to turn your SKILL.md into a live context window billboard.
                </p>
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 bg-[#F897FE] text-[#060A2A] px-6 py-3 rounded-lg font-semibold hover:bg-[#7C9CFF] transition-colors mx-auto"
                >
                  <Github size={18} />
                  Connect your repo
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Live */}
              {liveRepos.length > 0 && (
                <div className="mb-14">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-2xl font-bold text-[#EDEEFF]">Live Repos</h2>
                    <span className="flex items-center gap-1.5 bg-[#F897FE]/15 border border-[#F897FE]/40 text-[#F897FE] text-xs font-semibold px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F897FE] animate-pulse" />
                      Live
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {liveRepos.map(repo => (
                      <RepoCard key={repo.id} repo={repo} />
                    ))}
                  </div>
                </div>
              )}

              {/* Pending setup */}
              {pendingRepos.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-2xl font-bold text-[#EDEEFF]">Pending Setup</h2>
                    <span className="bg-[#8A8FBF]/15 border border-[#8A8FBF]/30 text-[#8A8FBF] text-xs font-semibold px-3 py-1 rounded-full">
                      Needs delimiters
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-70">
                    {pendingRepos.map(repo => (
                      <RepoCard key={repo.id} repo={repo} pending />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}

function RepoCard({ repo, pending = false }: { repo: GithubRepo; pending?: boolean }) {
  return (
    <div className="bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20 hover:border-[#F897FE]/40 transition-all overflow-hidden">
      {/* Repo header */}
      <div className="p-5 border-b border-[#8A8FBF]/20">
        <div className="flex items-center gap-3 mb-2">
          <img src={repo.avatarUrl} alt={repo.owner} className="w-7 h-7 rounded-full" />
          <a
            href={`https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#EDEEFF] font-semibold hover:text-[#F897FE] transition-colors text-sm"
          >
            {repo.fullName}
            <ExternalLink size={12} className="text-[#8A8FBF]" />
          </a>
        </div>
        {repo.description && (
          <p className="text-[#8A8FBF] text-xs line-clamp-2">{repo.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1 text-[#8A8FBF] text-xs">
            <Star size={11} /> {repo.stars.toLocaleString()}
          </span>
          <span className="flex items-center gap-1 text-[#8A8FBF] text-xs">
            <GitFork size={11} /> {repo.forks.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Message display */}
      <div className="p-5">
        {pending ? (
          <div className="text-center py-4">
            <p className="text-[#8A8FBF] text-xs mb-3">Add MARKEE delimiters to your SKILL.md to go live</p>
            <code className="block text-[#7C9CFF] text-xs bg-[#060A2A] rounded px-3 py-2 font-mono">
              {'<!-- MARKEE:START -->'}
              <br />
              {'<!-- MARKEE:END -->'}
            </code>
          </div>
        ) : repo.topMessage ? (
          <div>
            <div className="text-[#8A8FBF] text-xs mb-2 uppercase tracking-wider">Top Message</div>
            <p className="text-[#EDEEFF] text-sm font-mono leading-relaxed line-clamp-3">
              {repo.topMessage}
            </p>
            {repo.topBidder && (
              <p className="text-[#8A8FBF] text-xs mt-2 truncate">
                by {repo.topBidder}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-[#8A8FBF] text-sm mb-3">No messages yet</p>
            <Link
              href={`/ecosystem/platforms/github/${repo.owner}/${repo.repo}`}
              className="text-[#F897FE] text-sm font-semibold hover:text-[#7C9CFF] transition-colors"
            >
              Be the first →
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      {!pending && (
        <div className="px-5 pb-5">
          <Link
            href={`/ecosystem/platforms/github/${repo.owner}/${repo.repo}`}
            className="block w-full text-center bg-[#F897FE]/10 border border-[#F897FE]/30 text-[#F897FE] text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#F897FE]/20 transition-colors"
          >
            View Leaderboard
          </Link>
        </div>
      )}
    </div>
  )
}
