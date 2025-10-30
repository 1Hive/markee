import { base, optimism, arbitrum } from 'wagmi/chains'

// JB Multi Terminal V5 (same across all chains)
export const JB_TERMINAL = '0x2dB6d704058E552DeFE415753465df8dF0361846' as const

// RevNet Project IDs per chain
export const REVNET_CONFIG = {
  [base.id]: {
    projectId: 40,
    terminal: JB_TERMINAL,
  },
  [optimism.id]: {
    projectId: 46,
    terminal: JB_TERMINAL,
  },
  [arbitrum.id]: {
    projectId: 48,
    terminal: JB_TERMINAL,
  },
} as const

// Markee contract addresses per chain
export const CONTRACTS = {
  [optimism.id]: {
    investorStrategy: '0xD6780b51FDa9889e2d5fd14b02656FF339667829' as const,
    fixedStrategy: '0x7E3810f9af6Fd2b31E973Fe3577B715afD043582' as const,
  },
  // TODO: Deploy to Base and Arbitrum
  // [base.id]: { investorStrategy: '0x...', fixedStrategy: '0x...' },
  // [arbitrum.id]: { investorStrategy: '0x...', fixedStrategy: '0x...' },
} as const

export type SupportedChainId = keyof typeof REVNET_CONFIG
