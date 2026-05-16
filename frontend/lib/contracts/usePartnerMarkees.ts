'use client'

import { useReadContracts } from 'wagmi'
import { CANONICAL_CHAIN_ID } from '@/lib/contracts/addresses'
import { LeaderboardV11ABI, MarkeeABI } from '@/lib/contracts/abis'
import type { Markee } from '@/types'

// Partner configuration.
// leaderboardAddress — v1.1 Leaderboard to query and send new purchases to; null for unmigrated partners.
// strategyAddress — kept for reference only (no longer queried).
export const PARTNERS = [
  {
    slug: 'markee-cooperative',
    name: 'Markee Cooperative',
    description: 'The home message for markee.xyz — 100% of funds go to the Markee Cooperative treasury',
    strategyAddress: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a',
    leaderboardAddress: '0x0590b56430426A38D0fA065b839c10D542E75CCD' as `0x${string}` | null,
    logo: '/markee-logo.png',
    fundingSplit: '100% to Markee Cooperative',
    percentToBeneficiary: 10000,
    isCooperative: true,
    liveUrl: 'https://markee.xyz',
  },
  {
    slug: 'gardens',
    name: 'Gardens',
    description: 'Community governance platform built on conviction voting',
    strategyAddress: '0x346419315740F085Ba14cA7239D82105a9a2BDBE',
    leaderboardAddress: '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' as `0x${string}` | null,
    logo: '/partners/gardens.png',
    fundingSplit: '100% to Gardens',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: 'https://app.gardens.fund',
  },
  {
    slug: 'bread-cooperative',
    name: 'Bread Cooperative',
    description: 'A collective of communities building worker-owned financial infrastructure',
    strategyAddress: '0x05A40489965B355e0404c05134dA68626a5a927c',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/breadcoop.png',
    fundingSplit: '100% to Bread Cooperative',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'revnets',
    name: 'RevNets',
    description: 'Autonomous revenue-sharing networks with immutable tokenomics rules',
    strategyAddress: '0xe68CbEf87B710B379654Dfd3c0BEC8779bBCcEbB',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/revnets.png',
    fundingSplit: '100% to RevNets',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'juicebox',
    name: 'Juicebox',
    description: 'Programmable fundraising protocol for community-owned treasury formation',
    strategyAddress: '0x2a84960367832039C188C75FD6D6D5f2E8F640e2',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/juicebox.png',
    fundingSplit: '100% to Juicebox',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'giveth',
    name: 'Giveth',
    description: 'Web3 crowdfunding platform for nonprofits and social causes',
    strategyAddress: '0x00A60bA8351a69EF8d10F6c9b2b0E03aDE2E7431',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/giveth.png',
    fundingSplit: '100% to Giveth',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'flow-state',
    name: 'Flow State',
    description: 'Continuous funding apps, incentive systems & governance mechanisms',
    strategyAddress: '0x24512EE8E5f9138e2Bfca0c8253e7525035f4989',
    leaderboardAddress: null as `0x${string}` | null,
    logo: '/partners/flowstate.png',
    fundingSplit: '100% to Flow State',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: undefined,
  },
  {
    slug: 'superfluid',
    name: 'Superfluid',
    description: 'Protocol for money streaming - send and receive tokens continuously',
    strategyAddress: '0x7A6CE4d457AC1A31513BDEFf924FF942150D293E',
    leaderboardAddress: '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as `0x${string}` | null,
    logo: '/partners/superfluid.png',
    fundingSplit: '100% to Superfluid',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: 'https://campaigns.superfluid.org',
  },
  {
    slug: 'clawchemy',
    name: 'Clawchemy',
    description: 'Autonomous element discovery engine for AI agents on Base Network',
    strategyAddress: '0x89e608223BEc645227f11d8241e8175A9A95597E',
    leaderboardAddress: '0xdF4769a9593CB8E40d0409dEF2645651412A8A97' as `0x${string}` | null,
    logo: '/partners/clawchemy.png',
    fundingSplit: '100% to Clawchemy',
    percentToBeneficiary: 10000,
    isCooperative: false,
    liveUrl: 'https://clawchemy.xyz/',
  },
]

interface PartnerData {
  partner: typeof PARTNERS[number]
  winningMarkee: Markee | null
  totalFunds: bigint
  markeeCount: bigint
}

export function usePartnerMarkees() {
  const partnersWithLb = PARTNERS.filter(p => p.leaderboardAddress)

  // Step 1: getTopMarkees(1) + totalLeaderboardFunds + markeeCount for each leaderboard
  const step1Contracts = partnersWithLb.flatMap(p => [
    { address: p.leaderboardAddress!, abi: LeaderboardV11ABI, functionName: 'getTopMarkees' as const, args: [1n] as const, chainId: CANONICAL_CHAIN_ID },
    { address: p.leaderboardAddress!, abi: LeaderboardV11ABI, functionName: 'totalLeaderboardFunds' as const, chainId: CANONICAL_CHAIN_ID },
    { address: p.leaderboardAddress!, abi: LeaderboardV11ABI, functionName: 'markeeCount' as const, chainId: CANONICAL_CHAIN_ID },
  ])

  const { data: step1Data, isLoading: isLoadingStep1 } = useReadContracts({
    contracts: step1Contracts,
    query: { refetchInterval: 30_000 },
  })

  // Extract top markee addresses from step 1
  const topAddresses: (`0x${string}` | null)[] = partnersWithLb.map((_, i) => {
    const result = step1Data?.[i * 3]?.result as [string[], bigint[]] | undefined
    return (result?.[0]?.[0] ?? null) as `0x${string}` | null
  })

  const validTopAddresses = topAddresses.filter((a): a is `0x${string}` => !!a)

  // Step 2: message + name + owner + pricingStrategy for each top markee
  const step2Contracts = validTopAddresses.flatMap(addr => [
    { address: addr, abi: MarkeeABI, functionName: 'message' as const, chainId: CANONICAL_CHAIN_ID },
    { address: addr, abi: MarkeeABI, functionName: 'name' as const, chainId: CANONICAL_CHAIN_ID },
    { address: addr, abi: MarkeeABI, functionName: 'owner' as const, chainId: CANONICAL_CHAIN_ID },
    { address: addr, abi: MarkeeABI, functionName: 'pricingStrategy' as const, chainId: CANONICAL_CHAIN_ID },
  ])

  const { data: step2Data, isLoading: isLoadingStep2 } = useReadContracts({
    contracts: step2Contracts,
    query: { enabled: validTopAddresses.length > 0, refetchInterval: 30_000 },
  })

  // Assemble results
  let step2Index = 0
  const lbResults: Map<string, {
    winningMarkee: Markee | null
    totalFunds: bigint
    markeeCount: bigint
  }> = new Map()

  partnersWithLb.forEach((partner, i) => {
    const topResult = step1Data?.[i * 3]?.result as [string[], bigint[]] | undefined
    const topFunds0 = topResult?.[1]?.[0] ?? 0n
    const totalFunds = (step1Data?.[i * 3 + 1]?.result as bigint) ?? 0n
    const markeeCount = (step1Data?.[i * 3 + 2]?.result as bigint) ?? 0n
    const topAddr = topAddresses[i]

    let winningMarkee: Markee | null = null
    if (topAddr && step2Data) {
      const b = step2Index * 4
      winningMarkee = {
        address: topAddr,
        message: (step2Data[b]?.result as string) ?? '',
        name: (step2Data[b + 1]?.result as string) ?? '',
        owner: (step2Data[b + 2]?.result as string) ?? '',
        pricingStrategy: (step2Data[b + 3]?.result as string) ?? topAddr,
        totalFundsAdded: topFunds0,
        chainId: CANONICAL_CHAIN_ID,
      }
      step2Index++
    }

    lbResults.set(partner.slug, { winningMarkee, totalFunds, markeeCount })
  })

  const partnerData: PartnerData[] = PARTNERS.map(partner => {
    const r = lbResults.get(partner.slug)
    return {
      partner,
      winningMarkee: r?.winningMarkee ?? null,
      totalFunds: r?.totalFunds ?? 0n,
      markeeCount: r?.markeeCount ?? 0n,
    }
  })

  // Sort: Cooperative first, then by total funds
  partnerData.sort((a, b) => {
    if (a.partner.isCooperative) return -1
    if (b.partner.isCooperative) return 1
    return Number(b.totalFunds - a.totalFunds)
  })

  return {
    partnerData,
    isLoading: isLoadingStep1 || isLoadingStep2,
    error: null,
  }
}
