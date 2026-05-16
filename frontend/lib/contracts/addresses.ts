// Contract addresses and configuration for Markee
import { base } from 'wagmi/chains'
// All Markees are deployed on Base (canonical chain)
export const CANONICAL_CHAIN = base
export const CANONICAL_CHAIN_ID = base.id
// MARKEE token address (same across all chains)
export const MARKEE_TOKEN = '0xee3027f1e021b09D629922D40436C5DeA3c6cb38' as const
// Partner Reserve Distributor (Base only)
export const PARTNER_RESERVE_DISTRIBUTOR = '0x7FD2aF60B309f872a2cDAcCa853A9F7885466577' as const
// Markee Cooperative multisig — default beneficiary for non-partner strategies
export const COOPERATIVE_MULTISIG = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB' as const

// RevNet v6 config — JB terminal and project ID on Base
export const REVNET_V6_CONFIG = {
  [base.id]: {
    projectId: 152,
    terminal: '0x2dB6d704058E552DeFE415753465df8dF0361846' as const,
  },
} as const
// V1.2 Leaderboard addresses (Base only) — migrated from v1.1 via migrate-to-v12-eoa.sh
export const V11_LEADERBOARDS = {
  COOPERATIVE: '0x07a8d34c350C66D6A7e30dbf9b3f8dcC67b70aff' as const,
  GARDENS: '0x03E9b27cbc55Aa47bbDF6339A1f525bdFB87fBE0' as const,
  CLAWCHEMY: '0x753C1A3203AD3143ecEF57E986CB72f7da195741' as const,
  SUPERFLUID_MIGRATION: '0x2EfF03c0cB4c09583462adEA1abbCeE92b52a742' as const,
} as const

// Factory contract addresses (v1.2)
export const FACTORIES = {
  SUPERFLUID: '0x72AB2bf7A691Dc331bC0736050A02E7F3a82d352' as const,
  OPEN_INTERNET: '0x231C5d1374f1Ce0Cc0B9bc3Eda7E03785dD47fe5' as const,
  GITHUB: '0x0A880A8C102D16325eaa6b426AD3acd48338B501' as const,
} as const

// Fixed-price strategy contracts (still in use for the fixed-price leaderboard on the home page)
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
