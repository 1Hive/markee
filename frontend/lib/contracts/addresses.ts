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
        strategyAddress: '0x11ecb357084ebf87D7478414256C2745659e1760' as const,
      },
      {
        name: 'Anyone can pay to change',
        strategyAddress: '0xbC07fb2fC8F869bC1852A6a8d29eDc8a6eb0a66A' as const,
      },
      {
        name: 'That funds stuff you love',
        strategyAddress: '0x5b40a248cE3533e97cf3db696b065465428AB860' as const,
      },
    ],
  },
  // TODO: Deploy to Base and Arbitrum
  // [base.id]: { investorStrategy: '0x...', fixedStrategies: [...] },
  // [arbitrum.id]: { investorStrategy: '0x...', fixedStrategies: [...] },
} as const

export type SupportedChainId = keyof typeof REVNET_CONFIG
