'use client'

import { useCallback, useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { CANONICAL_CHAIN, MARKEE_TOKEN } from '@/lib/contracts/addresses'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { STREAMING_BASE, CFA_FORWARDER_ABI, SUPERFLUID_POOL_ABI } from '@/lib/superfluid/streaming'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ETHX = STREAMING_BASE.ethx as Address
const CFA_FORWARDER = STREAMING_BASE.cfaForwarder as Address

export interface PendingMarkee {
  // Unsettled ETH owed to the backer at `snapshotAt`, and the wei/sec it grows at from there.
  pendingWei: bigint
  ratePerSec: bigint
  snapshotAt: number
  // Platform fee the settlement takes off the top, in basis points.
  feeBps: number
  // Only the enforced #1 accrues: everyone else is refunded through the GDA pool instead.
  accruing: boolean
  mintsMarkee: boolean
  settledBalance: bigint
  isLoading: boolean
  refetch: () => void
}

// The backer's live MARKEE position on one streaming board: what settle() would pay them right now
// (ETH-denominated on-chain, quoted to MARKEE by the caller) and the rate it accrues at.
export function usePendingMarkee(board?: Address, user?: Address): PendingMarkee {
  const enabled = !!board && !!user

  const boardRead = {
    address: board as Address,
    abi: StreamingLeaderboardABI,
    chainId: CANONICAL_CHAIN.id,
  } as const

  const { data: base, isLoading: baseLoading, refetch: refetchBase, dataUpdatedAt } = useReadContracts({
    contracts: [
      { ...boardRead, functionName: 'pendingSettlement', args: [user as Address] },
      { ...boardRead, functionName: 'backerMarkee', args: [user as Address] },
      { ...boardRead, functionName: 'topMarkee' },
      { ...boardRead, functionName: 'topRate' },
      { ...boardRead, functionName: 'beneficiaryAddress' },
      { ...boardRead, functionName: 'percentToPlatformFeeReceiver' },
      { ...boardRead, functionName: 'revNetEnabled' },
      { address: MARKEE_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [user as Address], chainId: CANONICAL_CHAIN.id },
    ],
    query: { enabled },
  })

  const pendingWei = (base?.[0]?.result as bigint | undefined) ?? 0n
  const backedMarkee = base?.[1]?.result as Address | undefined
  const topMarkee = base?.[2]?.result as Address | undefined
  const topRate = (base?.[3]?.result as bigint | undefined) ?? 0n
  const beneficiary = base?.[4]?.result as Address | undefined
  const feeBps = Number((base?.[5]?.result as bigint | undefined) ?? 0n)
  // With RevNet off the board settles in plain ETH, so no MARKEE is minted for the backer.
  const mintsMarkee = (base?.[6]?.result as boolean | undefined) ?? true
  const settledBalance = (base?.[7]?.result as bigint | undefined) ?? 0n

  const isTop = !!backedMarkee && backedMarkee !== ZERO_ADDRESS && backedMarkee === topMarkee
  const canAccrue = enabled && isTop && topRate > 0n

  const { data: position, isLoading: positionLoading, refetch: refetchPosition } = useReadContracts({
    contracts: [
      { ...boardRead, functionName: 'aggregateRate', args: [backedMarkee as Address] },
      { ...boardRead, functionName: 'poolOf', args: [backedMarkee as Address] },
      {
        address: CFA_FORWARDER,
        abi: CFA_FORWARDER_ABI,
        functionName: 'getFlowrate',
        args: [ETHX, board as Address, (beneficiary ?? ZERO_ADDRESS) as Address],
        chainId: CANONICAL_CHAIN.id,
      },
    ],
    query: { enabled: canAccrue },
  })

  const aggregateRate = (position?.[0]?.result as bigint | undefined) ?? 0n
  const pool = position?.[1]?.result as Address | undefined
  const beneficiaryRate = (position?.[2]?.result as bigint | undefined) ?? 0n

  const { data: units, refetch: refetchUnits } = useReadContracts({
    contracts: [
      { address: pool as Address, abi: SUPERFLUID_POOL_ABI, functionName: 'getUnits', args: [user as Address], chainId: CANONICAL_CHAIN.id },
    ],
    query: { enabled: canAccrue && !!pool && pool !== ZERO_ADDRESS },
  })

  const backerUnits = (units?.[0]?.result as bigint | undefined) ?? 0n

  // The board keeps whatever the beneficiary stream does not take, and splits it across a Markee's
  // backers by pool units — the same arithmetic pendingSettlement accrues with on-chain.
  const ratePerSec = useMemo(() => {
    if (!canAccrue || aggregateRate === 0n || backerUnits === 0n) return 0n
    const retained = topRate > beneficiaryRate ? topRate - beneficiaryRate : 0n
    return (retained * backerUnits) / aggregateRate
  }, [canAccrue, aggregateRate, backerUnits, topRate, beneficiaryRate])

  const refetch = useCallback(() => {
    refetchBase(); refetchPosition(); refetchUnits()
  }, [refetchBase, refetchPosition, refetchUnits])

  return {
    pendingWei,
    ratePerSec,
    snapshotAt: Math.floor((dataUpdatedAt || Date.now()) / 1000),
    feeBps,
    accruing: ratePerSec > 0n,
    mintsMarkee,
    settledBalance,
    isLoading: baseLoading || (canAccrue && positionLoading),
    refetch,
  }
}
