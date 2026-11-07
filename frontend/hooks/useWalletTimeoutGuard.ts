'use client'

import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { getAddressUrl } from '@/lib/explorer'
import { isWalletTimeoutError } from '@/lib/transactionErrors'

export type WalletTimeoutState = 'clear' | 'waiting' | 'sent'

export function useWalletTimeoutGuard(writeError: unknown, account: string | undefined) {
  const client = usePublicClient({ chainId: CANONICAL_CHAIN_ID })
  const [state, setState] = useState<WalletTimeoutState>('clear')
  const baseline = useRef<number | null>(null)
  const handled = useRef<unknown>(null)

  useEffect(() => {
    if (!writeError || handled.current === writeError || !isWalletTimeoutError(writeError)) return
    handled.current = writeError
    baseline.current = null
    setState('waiting')
    if (client && account) {
      client.getTransactionCount({ address: account as Address, blockTag: 'pending' })
        .then(n => { baseline.current = n })
        .catch(() => {})
    }
  }, [writeError, client, account])

  useEffect(() => {
    if (state !== 'waiting' || !client || !account) return
    const id = setInterval(() => {
      if (baseline.current === null) return
      client.getTransactionCount({ address: account as Address, blockTag: 'pending' })
        .then(n => { if (baseline.current !== null && n > baseline.current) setState('sent') })
        .catch(() => {})
    }, 4_000)
    return () => clearInterval(id)
  }, [state, client, account])

  return {
    state,
    blocked: state !== 'clear',
    accountUrl: account ? getAddressUrl(CANONICAL_CHAIN_ID, account) : undefined,
    acknowledge: () => { setState('clear'); baseline.current = null },
  }
}
