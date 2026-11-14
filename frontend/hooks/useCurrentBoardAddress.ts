'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { isAddress } from 'viem'
import { parseCurrentAddress, redirectTarget, type CurrentAddress } from '@/lib/contracts/currentAddress'

async function fetchCurrentAddress(address: string): Promise<CurrentAddress> {
  const res = await fetch(`/api/boards/resolve?address=${address}`)
  const resolution = res.ok ? parseCurrentAddress(await res.json()) : null
  if (!resolution) throw new Error(`resolve ${address} failed (${res.status})`)
  return resolution
}

export function useCurrentBoardAddress(address: string | undefined, pathFor: (current: string) => string) {
  const router = useRouter()
  const enabled = !!address && isAddress(address, { strict: false })
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['current-board-address', address?.toLowerCase()],
    queryFn: () => fetchCurrentAddress(address!),
    enabled,
    staleTime: Infinity,
    retry: 2,
  })
  const target = address ? redirectTarget(address, data ?? null) : null
  const redirectPath = target ? pathFor(target) : null

  useEffect(() => {
    if (redirectPath) router.replace(redirectPath)
  }, [redirectPath, router])

  useEffect(() => {
    if (isError) console.warn('[useCurrentBoardAddress] resolve failed, showing the requested address', error)
  }, [isError, error])

  return { ready: !enabled || isError || (!isPending && !target) }
}
