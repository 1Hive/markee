// Contract addresses and configuration for Markee
import { base, optimism, arbitrum, mainnet } from 'wagmi/chains'
// All Markees are deployed on Base (canonical chain)
export const CANONICAL_CHAIN = base
export const CANONICAL_CHAIN_ID = base.id
// JB Multi Terminal V5 (same across all chains)
export const JB_TERMINAL = '0x2dB6d704058E552DeFE415753465df8dF0361846' as const
// MARKEE token address (same across all chains)
export const MARKEE_TOKEN = '0xee3027f1e021b09D629922D40436C5DeA3c6cb38' as const
// Partner Reserve Distributor (Base only)
export const PARTNER_RESERVE_DISTRIBUTOR = '0x7FD2aF60B309f872a2cDAcCa853A9F7885466577' as const
// RevNet Project IDs per chain (MARKEE token)
// Users receive tokens on the chain they pay from
export const REVNET_CONFIG = {
  [base.id]: {
    projectId: 119,
    terminal: JB_TERMINAL,
  },
  [optimism.id]: {
    projectId: 63,
    terminal: JB_TERMINAL,
  },
  [arbitrum.id]: {
    projectId: 62,
    terminal: JB_TERMINAL,
  },
  [mainnet.id]: {
    projectId: 56,
    terminal: JB_TERMINAL,
  },
} as const
// Strategy Contract Addresses (Base only - canonical chain)
// All strategies and Markees exist on Base
export const CONTRACTS = {
  [base.id]: {
    fixedPriceStrategies: [
      {
        name: '(message 1 loading...)',
        address: '0x35BBbF93395501678bAAd5898B73ab0778f5d303' as const,
      },
      {
        name: '(message 2 loading...)',
        address: '0x279ecAd5167bfa400b2C2bab32668ed6B88a49Dd' as const,
      },
      {
        name: '(message 3 loading...)',
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
  [base.id]: 'https://api.studio.thegraph.com/query/40814/markee-base/version/latest',
}

// Type exports
export type SupportedChainId = keyof typeof REVNET_CONFIG
