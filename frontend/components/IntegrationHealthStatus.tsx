'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'

type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown'

interface CheckResult {
  status: CheckStatus
  message: string
  detail?: Record<string, unknown>
}

interface HealthData {
  timestamp?: number
  overall: CheckStatus
  message?: string
  checks?: {
    leaderboard: CheckResult
    viewTracking: CheckResult
    moderation: CheckResult
  }
}

const STATUS = {
  ok:      { color: '#1DB227', label: 'Healthy',   Icon: CheckCircle2  },
  warn:    { color: '#FFD700', label: 'Degraded',  Icon: AlertTriangle  },
  error:   { color: '#FF6B6B', label: 'Issues',    Icon: AlertCircle   },
  unknown: { color: '#8A8FBF', label: 'Unknown',   Icon: HelpCircle    },
} as const

const CHECK_LABELS: Record<string, string> = {
  leaderboard:  'Leaderboard',
  viewTracking: 'View tracking',
  moderation:   'Moderation KV',
}

/**
 * Shows the health status of a Markee integration hosted at `url`.
 * Fetches via /api/openinternet/check-health (server-side proxy, no CORS issues).
 * Click the badge to expand per-check detail.
 */
export function IntegrationHealthStatus({ url }: { url: string }) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams({ url })
    fetch(`/api/openinternet/check-health?${params}`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ overall: 'error', message: 'Could not reach health endpoint' }))
      .finally(() => setLoading(false))
  }, [url])

  if (loading) {
    return <div className="h-4 w-14 rounded bg-[#1A1F4D] animate-pulse" />
  }

  if (!health) return null

  const cfg = STATUS[health.overall] ?? STATUS.unknown
  const { Icon } = cfg
  const hasDetail = !!health.checks

  return (
    <div>
      <button
        onClick={() => hasDetail && setExpanded(e => !e)}
        className={`flex items-center gap-1 text-[11px] font-medium transition-opacity ${hasDetail ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        style={{ color: cfg.color }}
        title={health.message}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
        {cfg.label}
        {hasDetail && (
          expanded ? <ChevronUp size={10} className="opacity-60" /> : <ChevronDown size={10} className="opacity-60" />
        )}
      </button>

      {expanded && health.checks && (
        <div
          className="mt-2 pl-3 space-y-1.5 border-l"
          style={{ borderColor: `${cfg.color}40` }}
        >
          {(Object.entries(health.checks) as [string, CheckResult][]).map(([key, check]) => {
            const c = STATUS[check.status] ?? STATUS.unknown
            const { Icon: CIcon } = c
            return (
              <div key={key} className="flex items-start gap-1.5">
                <CIcon size={11} style={{ color: c.color }} className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[#EDEEFF] text-[11px]">{CHECK_LABELS[key] ?? key}</span>
                  <p className="text-[10px] text-[#8A8FBF] leading-snug">{check.message}</p>
                  {check.detail && check.status !== 'ok' && (
                    <p className="text-[10px] text-[#8A8FBF]/60 leading-snug font-mono">
                      {JSON.stringify(check.detail)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
