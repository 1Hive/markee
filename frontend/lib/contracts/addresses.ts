// Contract addresses and configuration for Markee
import { base, optimism, arbitrum, mainnet } from 'wagmi/chains'

// All Markees are deployed on Base (canonical chain)
export const CANONICAL_CHAIN = base
export const CANONICAL_CHAIN_ID = base.id

// JB Multi Terminal V5 (same across all chains)
export const JB_TERMINAL = '0x2dB6d704058E552DeFE415753465df8dF0361846' as const

// MARKEE token address (same across all chains)
export const MARKEE_TOKEN = '0xf2A27822c8b7404c6aA7C3d7e2876DF597f02807' as const

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
        address: '' as const,
      },
      {
        name: 'Juicebox Top Dawg',
        address: '' as const,
      },
      {
        name: 'Revnets Top Dawg',
        address: '' as const,
      },
      {
        name: 'Bread Cooperative Top Dawg',
        address: '' as const,
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
  ].filter(addr => addr !== '')
}

// Subgraph endpoints
export const SUBGRAPH_URLS = {
  [base.id]: `https://gateway.thegraph.com/api/${process.env.NEXT_PUBLIC_GRAPH_TOKEN}/subgraphs/id/8kMCKUHSY7o6sQbsvufeLVo8PifxrsnagjVTMGcs6KdF`,
}
// Type exports
export type SupportedChainId = keyof typeof REVNET_CONFIG
