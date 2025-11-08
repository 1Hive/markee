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
    investorStrategy: '0xF0478A341aAd256C45CC7896ba08D2f00EAb72DA' as const,
    fixedStrategies: [
      {
        name: 'This is a sign',
        strategyAddress: '0x7D9C126745f8C0921Cc656A9301E0BB485f7cAF7' as const,
      },
      {
        name: 'Anyone can pay to change',
        strategyAddress: '0x4DE2a8F1deb851078979F53680fb1B2277e9E237' as const,
      },
      {
        name: 'That funds stuff you love',
        strategyAddress: '0x092817fb3C4cc60f588A422DfCd8630b3c51c7E1' as const,
      },
    ],
  },
  // TODO: Deploy to Base and Arbitrum
  // [base.id]: { investorStrategy: '0x...', fixedStrategies: [...] },
  // [arbitrum.id]: { investorStrategy: '0x...', fixedStrategies: [...] },
} as const

export type SupportedChainId = keyof typeof REVNET_CONFIG
