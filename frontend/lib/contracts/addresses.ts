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
// Strategy Contract Addresses (Base only - canonical chain)
// All strategies and Markees exist on Base
export const CONTRACTS = {
  [base.id]: {
    fixedPriceStrategies: [
      {
        name: 'this is a sign.',
        address: '0x35BBbF93395501678bAAd5898B73ab0778f5d303' as const,
      },
      {
        name: 'anyone can pay to change.',
        address: '0x279ecAd5167bfa400b2C2bab32668ed6B88a49Dd' as const,
      },
      {
        name: 'that funds the internet.',
        address: '0x4ceAadA2108526A94c3382D3AEE36B8888bCA335' as const,
      },
    ],
    topDawgStrategies: [
      {
        name: 'Markee Top Dawg',
        address: '0x558EB41ec9Cc90b86550617Eef5f180eA60e0e3a' as const,
      },
      {
        name: 'Gardens Top Dawg',
        address: '0x346419315740F085Ba14cA7239D82105a9a2BDBE' as const,
      },
      {
        name: 'Juicebox Top Dawg',
        address: '0x2a84960367832039C188C75FD6D6D5f2E8F640e2' as const,
      },
      {
        name: 'Revnets Top Dawg',
        address: '0xe68CbEf87B710B379654Dfd3c0BEC8779bBCcEbB' as const,
      },
      {
        name: 'Bread Cooperative Top Dawg',
        address: '0x05A40489965B355e0404c05134dA68626a5a927c' as const,
      },
      {
        name: 'Giveth Top Dawg',
        address: '0x00A60bA8351a69EF8d10F6c9b2b0E03aDE2E7431' as const,
      },
      {
        name: 'Flow State Top Dawg',
        address: '0x24512EE8E5f9138e2Bfca0c8253e7525035f4989' as const,
      },
      {
        name: 'Superfluid Top Dawg',
        address: '0x7A6CE4d457AC1A31513BDEFf924FF942150D293E' as const,
      },
      {
        name: 'Clawchemy Top Dawg',
        address: '0x89e608223BEc645227f11d8241e8175A9A95597E' as const,
      },
    ],
  },
} as const
// Helper to get all strategy addresses (useful for subgraph indexing)
export function getAllStrategyAddresses(): string[] {
  const baseContracts = CONTRACTS[base.id]
  return [
    ...baseContracts.fixedPriceStrategies.map(s => s.address),
    ...baseContracts.topDawgStrategies.map(s => s.address),
  ]
}
// Subgraph endpoints
export const SUBGRAPH_URLS = {
  [base.id]: `https://gateway.thegraph.com/api/${process.env.NEXT_PUBLIC_GRAPH_TOKEN}/subgraphs/id/8kMCKUHSY7o6sQbsvufeLVo8PifxrsnagjVTMGcs6KdF`,
}
