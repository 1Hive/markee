'use client'

import { useEffect, useState } from 'react'
import { DISMISSED_TX_KEY, PENDING_TX_EVENT, PENDING_TX_KEY, isDismissedTx, pendingFor, readPendingTxs, type PendingTx } from '@/lib/tx/pendingStore'

export function usePendingTxs(): PendingTx[] {
  const [list, setList] = useState<PendingTx[]>([])
  useEffect(() => {
    const refresh = () => setList(readPendingTxs())
    const onStorage = (e: StorageEvent) => { if (e.key === PENDING_TX_KEY) refresh() }
    refresh()
    window.addEventListener(PENDING_TX_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PENDING_TX_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return list
}

export function useIsDismissedTx(hash: string | undefined): boolean {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    const refresh = () => setDismissed(isDismissedTx(hash))
    const onStorage = (e: StorageEvent) => { if (e.key === DISMISSED_TX_KEY) refresh() }
    refresh()
    window.addEventListener(PENDING_TX_EVENT, refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PENDING_TX_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [hash])
  return dismissed
}

export function usePendingTxsFor(account: string | undefined, board: string | undefined): PendingTx[] {
  return pendingFor(usePendingTxs(), account, board)
}
