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
        name: 'THIS IS A SIGN.',
        address: '0xeC91B23E2C8ea47a9FDd10CD773bF011454f353F' as const,
      },
      {
        name: 'ANYONE CAN PAY TO CHANGE.',
        address: '0x7cAe7862650B238A24b50e0e96Bb96D15f167ECF' as const,
      },
      {
        name: 'THAT FUNDS THE INTERNET.',
        address: '0x46a767dd3BB16f19F685d388959FDeb18A04001A' as const,
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
  [base.id]: 'https://gateway.thegraph.com/api/subgraphs/id/8kMCKUHSY7o6sQbsvufeLVo8PifxrsnagjVTMGcs6KdF',
}
// Type exports
export type SupportedChainId = keyof typeof REVNET_CONFIG
