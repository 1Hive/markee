'use client'

/**
 * Markee Detail Page
 * 
 * Route: /markee/[address]
 * 
 * Displays full detail for a single markee including:
 *   - Current message with author attribution
 *   - Key stats (total funded, created date, update counts)
 *   - Message edit history with diffs
 *   - Funding history with Basescan transaction links
 *   - Name change history
 *   - Contract address link
 */

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Clock, Coins, MessageSquare, User, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { useMarkeeDetail } from '@/lib/contracts/useMarkeeDetail'
import { formatEth, formatAddress } from '@/lib/utils'
import { getTxUrl, getAddressUrl } from '@/lib/explorer'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { Emoji } from '@/components/ui/Emoji'
import { ModeratedContent, FlagButton } from '@/components/moderation'

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(ts: bigint | number): string {
  const date = new Date(Number(ts) * 1000)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(ts: bigint | number): string {
  const seconds = Math.floor(Date.now() / 1000 - Number(ts))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return `${Math.floor(seconds / 2592000)}mo ago`
}

// ── Copy Button ──────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="text-[#8A8FBF] hover:text-[#B8B6D9] transition-colors"
      title="Copy address"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  )
}

// ── Tx Link ──────────────────────────────────────────────────────────

function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a
      href={getTxUrl(CANONICAL_CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[#7C9CFF] hover:text-[#F897FE] transition-colors text-xs"
    >
      {label || `${hash.slice(0, 8)}...${hash.slice(-6)}`}
      <ExternalLink size={10} />
    </a>
  )
}

// ── Address Link ─────────────────────────────────────────────────────

function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={getAddressUrl(CANONICAL_CHAIN_ID, address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[#7C9CFF] hover:text-[#F897FE] transition-colors"
    >
      {label || formatAddress(address)}
      <ExternalLink size={10} />
    </a>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20">
      <div className="flex items-center gap-2 text-[#8A8FBF] text-xs mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-[#EDEEFF] font-bold text-lg">{value}</div>
    </div>
  )
}

// ── Section Header ───────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-[#F897FE]">{icon}</div>
      <h2 className="text-lg font-bold text-[#EDEEFF]">{title}</h2>
      {count !== undefined && (
        <span className="text-xs bg-[#8A8FBF]/20 text-[#8A8FBF] px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  )
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-[#8A8FBF]/20 rounded" />
      <div className="bg-[#0A0F3D] rounded-xl p-8 border border-[#8A8FBF]/20">
        <div className="h-10 w-3/4 bg-[#8A8FBF]/20 rounded mb-4" />
        <div className="h-5 w-1/4 bg-[#8A8FBF]/20 rounded ml-auto" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20">
            <div className="h-3 w-16 bg-[#8A8FBF]/20 rounded mb-2" />
            <div className="h-6 w-24 bg-[#8A8FBF]/20 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-[#0A0F3D] rounded-lg border border-[#8A8FBF]/20" />
        ))}
      </div>
    </div>
  )
}

// ── Tab Component ────────────────────────────────────────────────────

type TabId = 'funds' | 'messages' | 'names'

function TabButton({ 
  active, 
  onClick, 
  children, 
  count 
}: { 
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
        ${active
          ? 'bg-[#F897FE]/20 text-[#F897FE] border border-[#F897FE]/40'
          : 'text-[#8A8FBF] hover:text-[#B8B6D9] hover:bg-[#8A8FBF]/10 border border-transparent'
        }
      `}
    >
      {children}
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-[#F897FE]/30' : 'bg-[#8A8FBF]/20'}`}>
        {count}
      </span>
    </button>
  )
}

// ── Main Page ────────────────────────────────────────────────────────

export default function MarkeeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const markeeAddress = params.address as string
  const { markee, isLoading, error } = useMarkeeDetail(markeeAddress)
  const [activeTab, setActiveTab] = useState<TabId>('funds')

  return (
    <div className="min-h-screen bg-[#060A2A] text-[#EDEEFF]">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#8A8FBF] hover:text-[#F897FE] transition-colors mb-6 text-sm"
        >
          <ArrowLeft size={16} />
          Back to leaderboard
        </button>

        {isLoading && <DetailSkeleton />}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <p className="text-red-400 mb-2">Failed to load markee details</p>
            <p className="text-[#8A8FBF] text-sm">{error.message}</p>
          </div>
        )}

        {markee && (
          <div className="space-y-6">
            {/* ── Current Message ────────────────────────────────── */}
            <ModeratedContent chainId={CANONICAL_CHAIN_ID} markeeId={markee.address}>
              <div className="bg-gradient-to-r from-[#F897FE]/10 to-[#7C9CFF]/10 rounded-xl p-6 sm:p-8 border border-[#F897FE]/30">
                <div className="font-jetbrains text-2xl sm:text-3xl font-bold text-[#EDEEFF] mb-4 break-words">
                  {markee.message}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-[#8A8FBF] italic">
                    — <span className={markee.name ? 'text-[#B8B6D9] font-medium' : 'text-[#8A8FBF]'}>
                      {markee.name || formatAddress(markee.owner)}
                    </span>
                  </p>
                  <div className="flex items-center gap-3 text-xs text-[#8A8FBF]">
                    <FlagButton chainId={CANONICAL_CHAIN_ID} markeeId={markee.address} />
                    <span>Owner: <AddressLink address={markee.owner} /></span>
                    <CopyButton text={markee.owner} />
                  </div>
                </div>
              </div>
            </ModeratedContent>

            {/* ── Stats Grid ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={<Coins size={14} />}
                label="Total Funded"
                value={`${formatEth(markee.totalFundsAdded)} ETH`}
              />
              <StatCard
                icon={<Clock size={14} />}
                label="Created"
                value={new Date(markee.createdAt * 1000).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              />
              <StatCard
                icon={<MessageSquare size={14} />}
                label="Message Edits"
                value={markee.messageUpdateCount.toString()}
              />
              <StatCard
                icon={<User size={14} />}
                label="Contributions"
                value={markee.fundsAddedCount.toString()}
              />
            </div>

            {/* ── Strategy / Contract Info ────────────────────────── */}
            <div className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                <div className="flex items-center gap-3">
                  {markee.strategyName && (
                    <span className="text-[#B8B6D9]">
                      <Emoji className="text-base mr-1">🪧</Emoji>
                      {markee.strategyName}
                    </span>
                  )}
                  {markee.isPartnerStrategy && markee.partnerPercentage && (
                    <span className="text-xs bg-[#7C9CFF]/20 text-[#7C9CFF] px-2 py-0.5 rounded-full">
                      {markee.partnerPercentage}% to partner
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#8A8FBF]">
                  <span>Contract:</span>
                  <AddressLink address={markee.address} />
                  <CopyButton text={markee.address} />
                </div>
              </div>
            </div>

            {/* ── History Tabs ────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                <TabButton
                  active={activeTab === 'funds'}
                  onClick={() => setActiveTab('funds')}
                  count={markee.fundsAddedCount}
                >
                  <Coins size={14} /> Funding
                </TabButton>
                <TabButton
                  active={activeTab === 'messages'}
                  onClick={() => setActiveTab('messages')}
                  count={markee.messageUpdateCount}
                >
                  <MessageSquare size={14} /> Messages
                </TabButton>
                {markee.nameUpdates.length > 0 && (
                  <TabButton
                    active={activeTab === 'names'}
                    onClick={() => setActiveTab('names')}
                    count={markee.nameUpdates.length}
                  >
                    <User size={14} /> Names
                  </TabButton>
                )}
              </div>

              {/* ── Funding History ──────────────────────────────── */}
              {activeTab === 'funds' && (
                <div className="space-y-2">
                  {markee.fundsAddedEvents.length === 0 ? (
                    <p className="text-[#8A8FBF] text-sm text-center py-8">No funding events yet.</p>
                  ) : (
                    markee.fundsAddedEvents.map((event) => (
                      <div
                        key={event.id}
                        className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#7C9CFF]/20 flex items-center justify-center flex-shrink-0">
                              <Coins size={14} className="text-[#7C9CFF]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#7C9CFF]">
                                  +{formatEth(event.amount)} ETH
                                </span>
                                <span className="text-[#8A8FBF] text-xs">
                                  → {formatEth(event.newTotal)} total
                                </span>
                              </div>
                              <div className="text-xs text-[#8A8FBF] mt-0.5">
                                by <AddressLink address={event.addedBy} />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-[#8A8FBF] sm:text-right">
                            <span title={formatTimestamp(event.timestamp)}>
                              {timeAgo(event.timestamp)}
                            </span>
                            <TxLink hash={event.transactionHash} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Message History ──────────────────────────────── */}
              {activeTab === 'messages' && (
                <div className="space-y-2">
                  {markee.messageUpdates.length === 0 ? (
                    <p className="text-[#8A8FBF] text-sm text-center py-8">No message changes yet.</p>
                  ) : (
                    markee.messageUpdates.map((event) => (
                      <div
                        key={event.id}
                        className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-colors"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-[#F897FE]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <MessageSquare size={14} className="text-[#F897FE]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {/* Old message - struck through */}
                                <div className="text-xs text-[#8A8FBF] line-through mb-1 truncate" title={event.oldMessage}>
                                  {event.oldMessage || '(empty)'}
                                </div>
                                {/* New message */}
                                <div className="font-jetbrains text-sm text-[#EDEEFF] break-words">
                                  {event.newMessage}
                                </div>
                                <div className="text-xs text-[#8A8FBF] mt-1">
                                  by <AddressLink address={event.updatedBy} />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-[#8A8FBF] flex-shrink-0 sm:text-right">
                              <span title={formatTimestamp(event.timestamp)}>
                                {timeAgo(event.timestamp)}
                              </span>
                              <TxLink hash={event.transactionHash} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Name History ─────────────────────────────────── */}
              {activeTab === 'names' && (
                <div className="space-y-2">
                  {markee.nameUpdates.length === 0 ? (
                    <p className="text-[#8A8FBF] text-sm text-center py-8">No name changes yet.</p>
                  ) : (
                    markee.nameUpdates.map((event) => (
                      <div
                        key={event.id}
                        className="bg-[#0A0F3D] rounded-lg p-4 border border-[#8A8FBF]/20 hover:border-[#8A8FBF]/40 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#FFA94D]/20 flex items-center justify-center flex-shrink-0">
                              <User size={14} className="text-[#FFA94D]" />
                            </div>
                            <div>
                              <span className="text-xs text-[#8A8FBF] line-through mr-2">
                                {event.oldName || '(none)'}
                              </span>
                              <span className="text-sm text-[#EDEEFF] font-medium">
                                {event.newName || '(cleared)'}
                              </span>
                              <div className="text-xs text-[#8A8FBF] mt-0.5">
                                by <AddressLink address={event.updatedBy} />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-[#8A8FBF] sm:text-right">
                            <span title={formatTimestamp(event.timestamp)}>
                              {timeAgo(event.timestamp)}
                            </span>
                            <TxLink hash={event.transactionHash} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
