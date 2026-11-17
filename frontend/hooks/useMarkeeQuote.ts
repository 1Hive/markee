'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient, useReadContracts } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { CANONICAL_CHAIN_ID, REVNET_V6_CONFIG } from '@/lib/contracts/addresses'
import {
  directPayPlan, markeePayPlan, mintFloorTokens, quotePayPlan, QUOTE_PLACEHOLDER_ACCOUNT, revnetRouteABI,
  type MarkeeEstimate, type PayPlan, type RevnetRoute,
} from '@/lib/markee/quote'

const DEBOUNCE_MS = 350

function useDebounced<T>(value: T): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [value])
  return debounced
}

const ROUTE_FIELDS = [
  'revNetEnabled', 'beneficiaryAddress', 'percentToBeneficiary', 'platformFeeReceiver',
  'percentToPlatformFeeReceiver', 'revNetTerminal', 'revNetProjectId',
] as const

function useRevnetRoute(strategy: Address | undefined, enabled: boolean): { route: RevnetRoute | null; loading: boolean } {
  const { data, isLoading } = useReadContracts({
    contracts: ROUTE_FIELDS.map(functionName => ({ address: strategy, abi: revnetRouteABI, functionName, chainId: CANONICAL_CHAIN_ID })),
    query: { enabled: enabled && !!strategy },
  })
  if (!data || data.some(r => r.status !== 'success')) return { route: null, loading: isLoading }
  const [revnetEnabled, beneficiary, beneficiaryBps, feeReceiver, feeBps, terminal, projectId] = data.map(r => r.result)
  return { loading: false, route: {
    revnetEnabled: revnetEnabled as boolean, beneficiary: beneficiary as Address, beneficiaryBps: beneficiaryBps as bigint,
    feeReceiver: feeReceiver as Address, feeBps: feeBps as bigint, terminal: terminal as Address, projectId: projectId as bigint,
  } }
}

function usePlanEstimate(plan: PayPlan | null, account: Address, enabled: boolean): MarkeeEstimate & { loading: boolean } {
  const client = usePublicClient({ chainId: CANONICAL_CHAIN_ID })
  const key = plan ? plan.pays.map(p => `${p.beneficiary}:${p.amount}`).join(',') : ''
  const debouncedKey = useDebounced(key)
  const settled = debouncedKey === key
  const query = useQuery({
    queryKey: ['markee-quote', plan?.terminal, plan?.projectId?.toString(), account, debouncedKey],
    enabled: enabled && !!client && !!plan && plan.buyerIndex !== null && settled,
    queryFn: () => quotePayPlan(client!, plan!, account),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  })
  const floor = plan ? mintFloorTokens(plan) : null
  if (plan && plan.buyerIndex === null) return { quoted: 0, floor: 0, loading: false }
  const quoted = settled && query.data !== undefined ? Number(formatEther(query.data)) : null
  return { quoted, floor, loading: !!plan && quoted === null && !query.isError }
}

export function useMarkeePurchaseQuote(strategy: Address | undefined, amountWei: bigint, account: Address | undefined, enabled = true) {
  const { route, loading: routeLoading } = useRevnetRoute(strategy, enabled)
  const buyer = account ?? QUOTE_PLACEHOLDER_ACCOUNT
  const plan = useMemo(() => route ? markeePayPlan(amountWei, route, buyer) : null, [route?.terminal, route?.projectId, route?.revnetEnabled, route?.beneficiary, route?.beneficiaryBps, route?.feeReceiver, route?.feeBps, amountWei, buyer]) // eslint-disable-line react-hooks/exhaustive-deps
  const estimate = usePlanEstimate(plan, buyer, enabled)
  return { ...estimate, loading: estimate.loading || routeLoading }
}

export function useDirectRevnetQuote(amountWei: bigint, account: Address | undefined, enabled = true) {
  const cfg = REVNET_V6_CONFIG[CANONICAL_CHAIN_ID]
  const buyer = account ?? QUOTE_PLACEHOLDER_ACCOUNT
  const plan = useMemo(() => directPayPlan(amountWei, cfg.terminal, BigInt(cfg.projectId), buyer), [amountWei, cfg.terminal, cfg.projectId, buyer])
  return usePlanEstimate(plan, buyer, enabled)
}
