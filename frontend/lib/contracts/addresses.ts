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

// RevNet v6 config (to be wired up once v6 is deployed — no code changes needed,
// admin calls to setRevNetTerminal / setRevNetProjectId on each strategy will re-enable routing)
// export const REVNET_V6_CONFIG = {
//   [base.id]: { projectId: TBD, terminal: '0x...' },
// }
// V1.1 Leaderboard addresses (Base only)
export const V11_LEADERBOARDS = {
  COOPERATIVE: '0xC981e99bfB1349904C56bdafC429cE04E5AD9Ce4' as const,
  GARDENS: '0x660a5805384a68dE57709bd89124B73B8C03371C' as const,
  CLAWCHEMY: '0x824f948Bb0afd7a9bc360DF134fA353fD3cE7CE5' as const,
  SUPERFLUID_MIGRATION: '0xb6CCc63d3FdC2D22e3147c01AB6A006f32Dd7580' as const,
} as const

// Factory contract addresses
export const FACTORIES = {
  SUPERFLUID: '0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d' as const,
  OPEN_INTERNET: '0xb9922E2bdbA79190F0da51Fe362297Ef214eD254' as const,
  GITHUB: '0xb1E2dC95b50b4Ee3b1BD4F4F87e6B07b41bE4e07' as const,
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
