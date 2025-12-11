import { base, optimism, arbitrum, mainnet } from 'wagmi/chains'

// JB Multi Terminal V5 (same across all chains)
export const JB_TERMINAL = '0x2dB6d704058E552DeFE415753465df8dF0361846' as const

// MARKEE token address (same across all chains)
// TODO: Update this with the actual MARKEE token address when deployed
export const MARKEE_TOKEN = '0xf2A27822c8b7404c6aA7C3d7e2876DF597f02807' as const

// RevNet Project IDs per chain (MARKEE token)
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
    projectId: 53,
    terminal: JB_TERMINAL,
  },
} as const

// Markee contract addresses per chain
export const CONTRACTS = {
  [optimism.id]: {
    investorStrategy: '0x3B840B91fbEB6f942CE5770d094F89cb36D27BA1' as const,
    fixedStrategies: [
      {
        name: 'Left Message',
        strategyAddress: '0x11ecb357084ebf87D7478414256C2745659e1760' as const,
      },
      {
        name: 'Center Message',
        strategyAddress: '0xbC07fb2fC8F869bC1852A6a8d29eDc8a6eb0a66A' as const,
      },
      {
        name: 'Right Message',
        strategyAddress: '0x5b40a248cE3533e97cf3db696b065465428AB860' as const,
      },
    ],
  },
} as const

export type SupportedChainId = keyof typeof REVNET_CONFIG
