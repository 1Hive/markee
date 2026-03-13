// hooks/useGithubTraffic.ts
'use client'
import { useState, useCallback } from 'react'

interface TrafficDay {
  timestamp: string
  count: number
  uniques: number
}

interface GithubTraffic {
  count: number       // total views, last 14 days
  uniques: number     // unique visitors, last 14 days
  views: TrafficDay[]
  cached: boolean
}

type Status = 'idle' | 'loading' | 'success' | 'error' | 'not_linked'

export function useGithubTraffic(address: string) {
  const [traffic, setTraffic] = useState<GithubTraffic | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address) return
    setStatus('loading')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/github/traffic?address=${address.toLowerCase()}`)
      const data = await res.json()

      if (res.status === 404) {
        setStatus('not_linked')
        return
      }
      if (!res.ok) {
        setStatus('error')
        setErrorMessage(data.error ?? 'Failed to fetch GitHub traffic')
        return
      }

      setTraffic(data)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMessage('Network error')
    }
  }, [address])

  return { traffic, status, errorMessage, refresh }
}
