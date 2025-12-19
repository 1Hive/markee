// addresses.ts
// Contract addresses and configuration for Markee
// All Markees are deployed on Base (canonical chain)
export const CANONICAL_CHAIN = 'base' as const;
export const CANONICAL_CHAIN_ID = 8453 as const;

// RevNet configuration
export const REVNET_TERMINAL = '0x2dB6d704058E552DeFE415753465df8dF0361846' as const;

// Production RevNet Project IDs (MARKEE token)
// Users receive tokens on the chain they pay from
export const REVNET_PROJECT_IDS = {
  base: 52,
  optimism: 52,
  arbitrum: 55,
  mainnet: 33,
} as const;

// Strategy Contract Addresses (Base only - canonical chain)

// FixedPrice strategies displayed on homepage
export const FIXED_PRICE_STRATEGIES = [
  {
    name: 'THIS IS A SIGN.',
    address: '0xeC91B23E2C8ea47a9FDd10CD773bF011454f353F'
  },
  {
    name: 'ANYONE CAN PAY TO CHANGE.', 
    address: '0x7cAe7862650B238A24b50e0e96Bb96D15f167ECF',
  },
  {
    name: 'THAT FUNDS THE INTERNET.',
    address: '0x46a767dd3BB16f19F685d388959FDeb18A04001A',
  },
] as const;

// TopDawg leaderboard strategies
export const TOP_DAWG_STRATEGIES = [
  {
    name: 'Markee Top Dawg',
    address: '',
  },
  {
    name: 'Gardens Top Dawg',
    address: '',
  },
  {
    name: 'Juicebox Top Dawg',
    address: '',
  }, 
  {
    name: 'Revnets Top Dawg',
    address: '',
  },
  {
    name: 'Bread Cooperative Top Dawg',
    address: '',
  },
  
] as const;

// Helper to get all strategy addresses (useful for subgraph indexing)
export function getAllStrategyAddresses(): string[] {
  return [
    ...FIXED_PRICE_STRATEGIES.map(s => s.address),
    ...TOP_DAWG_STRATEGIES.map(s => s.address),
  ].filter(addr => addr !== '');
}

// Chain IDs for reference
export const CHAIN_IDS = {
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  mainnet: 1,
} as const;

// Helper to get RevNet project ID for a given chain
export function getRevNetProjectId(chainId: number): number | undefined {
  switch (chainId) {
    case CHAIN_IDS.base:
      return REVNET_PROJECT_IDS.base;
    case CHAIN_IDS.optimism:
      return REVNET_PROJECT_IDS.optimism;
    case CHAIN_IDS.arbitrum:
      return REVNET_PROJECT_IDS.arbitrum;
    case CHAIN_IDS.mainnet:
      return REVNET_PROJECT_IDS.mainnet;
    default:
      return undefined;
  }
}

// Type exports
export type ChainName = keyof typeof CHAIN_IDS;
export type SupportedChainId = typeof CHAIN_IDS[ChainName];
