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
    projectId: 52,
    terminal: JB_TERMINAL,
  },
  [optimism.id]: {
    projectId: 52,
    terminal: JB_TERMINAL,
  },
  [arbitrum.id]: {
    projectId: 55,
    terminal: JB_TERMINAL,
  },
  [mainnet.id]: {
    projectId: 33,
    terminal: JB_TERMINAL,
  },
} as const

// Strategy Contract Addresses (Base only - canonical chain)
// All strategies and Markees exist on Base
export const CONTRACTS = {
  [base.id]: {
    fixedPriceStrategies: [
      {
        name: 'Left hero message',
        address: '0x93587701457335f7e36539600d4105EfEB977910' as const,
      },
      {
        name: 'Middle hero message',
        address: '0xdFEF454F2C5e37573Ce1F7F73332Bc1F8F6b549D' as const,
      },
      {
        name: 'Right hero message',
        address: '0x810cd857C1Af9A44D26bbD0857eB8377E0ae099E' as const,
      },
    ],
    topDawgStrategies: [
      {
        name: 'Markee Top Dawg',
        address: '0x7ffb9Ae52D0FF837796A362B9C975c3C8A3226dd' as const,
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
