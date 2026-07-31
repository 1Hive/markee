// Contract addresses and configuration for Markee
import { base } from 'wagmi/chains'
import type { Chain } from 'viem'
// All Markees are deployed on Base (canonical chain)
export const CANONICAL_CHAIN: Chain = base
export const CANONICAL_CHAIN_ID = base.id
// Earliest known Markee factory deployment on Base; avoids scanning logs from genesis.
export const BASE_MARKEE_EVENTS_FROM_BLOCK = 43_452_028n
// MARKEE token address (same across all chains)
export const MARKEE_TOKEN = '0xF6627cF19317C33B457f77452876e6e297c4942F' as const
// Partner Reserve Distributor (Base only)
export const PARTNER_RESERVE_DISTRIBUTOR = '0x7FD2aF60B309f872a2cDAcCa853A9F7885466577' as const
// Markee Cooperative multisig — default beneficiary for non-partner strategies
export const COOPERATIVE_MULTISIG = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB' as const

// RevNet v6 config — JB terminal and project ID on Base
export const REVNET_V6_CONFIG = {
  [base.id]: {
    projectId: 7,
    terminal: '0x130f5Dd2bD8805443Cf41755253D778a75a67f53' as const,
  },
} as const

// V1.3 Leaderboard addresses (Base only) — migrated from v1.2 via migrate-to-v13.sh
export const V13_LEADERBOARDS = {
  COOPERATIVE: '0x0590b56430426A38D0fA065b839c10D542E75CCD' as const,
  GARDENS: '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' as const,
  CLAWCHEMY: '0xdF4769a9593CB8E40d0409dEF2645651412A8A97' as const,
  SUPERFLUID_MIGRATION: '0xAa37d049DFBfc07f9e8526A4a9bde418DF9F1B79' as const,
} as const

// V1.3 LeaderboardFactory contract addresses
export const FACTORIES = {
  SUPERFLUID: '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as const,
  OPEN_INTERNET: '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c' as const,
  GITHUB: '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2' as const,
} as const

// StreamingLeaderboardFactory — deployment is gated on the Superfluid governance setAppRegistrationKey.
// Set NEXT_PUBLIC_STREAMING_FACTORY to the deployed factory address to light up the streaming listing +
// create flow; unset/invalid keeps the feature hidden.
export const STREAMING_FACTORY = (process.env.NEXT_PUBLIC_STREAMING_FACTORY ?? '') as `0x${string}` | ''
export const STREAMING_ENABLED = /^0x[0-9a-fA-F]{40}$/.test(STREAMING_FACTORY)

// Fixed-price strategy contracts (in use for the fixed-price messages on the home page)
export const CONTRACTS = {
  [base.id]: {
    fixedPriceStrategies: [
      {
        name: 'this is a sign.',
        address: '0x2D3889567e26B5d944f81C8Da3521fF713B803fD' as const,
      },
      {
        name: 'anyone can pay to change.',
        address: '0x0F5c796e985f2eac6C82429a2313F354e114329d' as const,
      },
      {
        name: 'that funds the internet.',
        address: '0x91a5bd98d4e43bF49BEd7203641159829cd2ff81' as const,
      },
    ],
  },
} as const
