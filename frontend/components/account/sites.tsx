// Where a board or message is shown: its verified site URLs and linked GitHub files.

import { Github, Globe2, Zap } from 'lucide-react'
import type { AnyLeaderboard, FundedMessage, LinkedFile, MyMessage, WebsiteLeaderboard } from '@/components/account/types'

export interface Integration {
  key: string
  label: string
  href: string
  url?: string
  file?: LinkedFile
}

const fileUrl = (f: LinkedFile) => `https://github.com/${f.repoFullName}/blob/HEAD/${f.filePath}`
const urlLabel = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')

export function integrationsOf(lb: AnyLeaderboard): Integration[] {
  const w = lb as WebsiteLeaderboard
  const urls = lb.verifiedUrls?.length ? lb.verifiedUrls : w.verifiedUrl ? [w.verifiedUrl] : []
  return [
    ...(lb.linkedFiles ?? []).map(f => ({ key: `f:${f.repoFullName}/${f.filePath}`, label: `${f.repoFullName} · ${f.filePath}`, href: fileUrl(f), file: f })),
    ...urls.map(u => ({ key: `u:${u}`, label: urlLabel(u), href: u, url: u })),
  ]
}

// "Shown on" for a table row: the repo or host only (the file path lives in the Manage drawer).
export function shownOn(lb: AnyLeaderboard): { label: string; more: number } | null {
  const live = integrationsOf(lb).filter(i => i.url || i.file?.verified)
  if (!live.length) return null
  return { label: live[0].file ? live[0].file.repoFullName : live[0].label, more: live.length - 1 }
}

export function messageShownOn(m: MyMessage | FundedMessage): string | null {
  const url = m.siteUrl ?? m.verifiedUrls?.[0] ?? null
  return m.repoFullName ?? (url ? urlLabel(url) : null)
}

export function PlatformGlyph({ platform, size = 13, color }: { platform?: string | null; size?: number; color: string }) {
  if (platform === 'github') return <Github size={size} style={{ color, flexShrink: 0 }} />
  if (platform === 'superfluid') return <Zap size={size} style={{ color, flexShrink: 0 }} />
  return <Globe2 size={size} style={{ color, flexShrink: 0 }} />
}
