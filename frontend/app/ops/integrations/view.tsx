'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalizeHost } from '@/lib/views/host'

type Board = { address: string; name?: string; migratedFrom?: string | null; siteUrl?: string | null; category: string }
type Verification = { verifiedUrls: string[]; linkedFiles: Array<{ repoFullName: string; filePath: string; verified: boolean }> }
type Signal = { version: string; lastSeen: number }
type Evidence = { verification: Record<string, Verification>; sdk: Record<string, Record<string, Signal>> }
type Filter = 'all' | 'missing' | 'sdk' | 'unknown'

const categories = ['openinternet', 'forsale', 'streaming'] as const
const categoryName: Record<string, string> = { openinternet: 'Open Internet', forsale: 'For Sale', streaming: 'For Rent' }
const colors = { bg: '#0a0e2e', panel: '#10163c', border: '#2d345e', text: '#f4f3ff', muted: '#a7abc8', pink: '#f897fe', green: '#76d9ad' }

async function loadBoards(): Promise<Board[]> {
  const lists = await Promise.all(categories.map(async category => {
    const response = await fetch(`/api/${category}/leaderboards`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`${category} boards: HTTP ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data?.leaderboards)) throw new Error(`${category} boards unavailable`)
    return data.leaderboards.map((board: Board) => ({ ...board, category }))
  }))
  return [...new Map(lists.flat().map(board => [board.address.toLowerCase(), board])).values()]
}

async function loadEvidence(addresses: string[]): Promise<Evidence> {
  const result: Evidence = { verification: {}, sdk: {} }
  for (let i = 0; i < addresses.length; i += 200) {
    const response = await fetch('/api/boards/client-observations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ addresses: addresses.slice(i, i + 200) }),
    })
    if (!response.ok) throw new Error(`Integration evidence: HTTP ${response.status}`)
    const data = await response.json() as Evidence
    Object.assign(result.verification, data.verification)
    Object.assign(result.sdk, data.sdk)
  }
  return result
}

function verifiedCount(value?: Verification) {
  return (value?.verifiedUrls?.length ?? 0) + (value?.linkedFiles?.filter(file => file.verified).length ?? 0)
}

export function IntegrationAudit() {
  const [boards, setBoards] = useState<Board[]>([])
  const [evidence, setEvidence] = useState<Evidence>({ verification: {}, sdk: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let current = true
    loadBoards()
      .then(async list => ({ list, details: await loadEvidence(list.map(board => board.address)) }))
      .then(({ list, details }) => { if (current) { setBoards(list); setEvidence(details); setLoading(false) } })
      .catch(reason => { if (current) { setError(reason instanceof Error ? reason.message : 'Unable to load integration audit'); setLoading(false) } })
    return () => { current = false }
  }, [])

  const rows = useMemo(() => boards.filter(board => {
    const address = board.address.toLowerCase()
    const verification = evidence.verification[address]
    const sdk = evidence.sdk[address] ?? {}
    const term = query.trim().toLowerCase()
    if (term && ![board.name, board.address, board.siteUrl, ...(verification?.verifiedUrls ?? [])].some(value => value?.toLowerCase().includes(term))) return false
    if (filter === 'missing' && verifiedCount(verification) > 0) return false
    if (filter === 'sdk' && Object.keys(sdk).length === 0) return false
    if (filter === 'unknown' && (verifiedCount(verification) === 0 || Object.keys(sdk).length > 0)) return false
    return true
  }), [boards, evidence, filter, query])

  const noVerified = boards.filter(board => verifiedCount(evidence.verification[board.address.toLowerCase()]) === 0).length
  const sdkSeen = boards.filter(board => Object.keys(evidence.sdk[board.address.toLowerCase()] ?? {}).length > 0).length
  const inputStyle = { background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px' }

  return <main style={{ minHeight: '100vh', background: colors.bg, color: colors.text, padding: '32px clamp(16px, 4vw, 64px)', fontFamily: 'Inter, system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1300, margin: '0 auto' }}>
      <p style={{ color: colors.pink, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>Markee operations</p>
      <h1 style={{ margin: '6px 0 10px', fontSize: 'clamp(26px, 3vw, 36px)' }}>Integration audit</h1>
      <p style={{ color: colors.muted, maxWidth: 800, lineHeight: 1.6 }}>
        Live board listings and verified website or GitHub placements. An SDK signal means a verified host reported an SDK version to Markee; it is self-reported. Unknown includes older SDKs and custom clients. A missing verified placement does not prove the board has no website.
      </p>
      {loading ? <p>Loading boards and integration evidence…</p> : error ? <p role="alert" style={{ color: '#ff9c9c' }}>{error}</p> : <>
        <p style={{ color: colors.muted }}>{boards.length} boards · {noVerified} without a verified integration · {sdkSeen} with a version signal</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '24px 0 16px' }}>
          <input aria-label="Search boards" placeholder="Search board, address, or site" value={query} onChange={event => setQuery(event.target.value)} style={{ ...inputStyle, flex: '1 1 270px' }} />
          <select aria-label="Filter integrations" value={filter} onChange={event => setFilter(event.target.value as Filter)} style={inputStyle}>
            <option value="all">All boards</option><option value="missing">No verified integration</option><option value="sdk">SDK signal</option><option value="unknown">Verified, client unknown</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, textAlign: 'left' }}>
            <thead style={{ background: colors.panel }}><tr>{['Board', 'Category', 'Contract', 'Verified integrations', 'Client evidence'].map(label => <th key={label} style={{ padding: '12px 14px', fontSize: 12, color: colors.muted }}>{label}</th>)}</tr></thead>
            <tbody>{rows.map(board => {
              const address = board.address.toLowerCase()
              const verification = evidence.verification[address]
              const sdk = evidence.sdk[address] ?? {}
              const sites = verification?.verifiedUrls ?? []
              const files = verification?.linkedFiles?.filter(file => file.verified) ?? []
              return <tr key={address} style={{ borderTop: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                <td style={{ padding: '14px' }}><a href={`/markee/${board.address}`} style={{ color: colors.text, fontWeight: 650 }}>{board.name || `${board.address.slice(0, 8)}…`}</a><div style={{ color: colors.muted, fontFamily: 'monospace', fontSize: 11 }}>{board.address}</div></td>
                <td style={{ padding: '14px', whiteSpace: 'nowrap' }}>{categoryName[board.category]}</td>
                <td style={{ padding: '14px', whiteSpace: 'nowrap', color: colors.muted }}>{board.migratedFrom ? 'Migrated successor' : 'No predecessor listed'}</td>
                <td style={{ padding: '14px' }}>{sites.length === 0 && files.length === 0 ? <span style={{ color: colors.muted }}>None verified</span> : <>{sites.map(url => <div key={url}><a href={url} target="_blank" rel="noopener noreferrer" style={{ color: colors.pink }}>{normalizeHost(url) ?? url}</a></div>)}{files.map(file => <div key={`${file.repoFullName}/${file.filePath}`} style={{ color: colors.muted }}>GitHub: {file.repoFullName}/{file.filePath}</div>)}</>}</td>
                <td style={{ padding: '14px' }}>{sites.length === 0 ? <span style={{ color: colors.muted }}>No website to classify</span> : sites.map(url => {
                  const signal = sdk[normalizeHost(url) ?? '']
                  return <div key={url} title={signal ? `Self-reported SDK version; last seen ${new Date(signal.lastSeen).toLocaleString()}` : 'Older SDK or custom client; inspect the host source or lockfile to classify.'} style={{ color: signal ? colors.green : colors.muted, whiteSpace: 'nowrap' }}>{signal ? `SDK ${signal.version} signal` : 'Unknown'}</div>
                })}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <p style={{ color: colors.muted, fontSize: 12 }}>{rows.length} shown. This page is unlisted and excluded from search indexing; the link itself is not access control.</p>
      </>}
    </div>
  </main>
}
