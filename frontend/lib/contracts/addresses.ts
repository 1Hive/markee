// Contract addresses and configuration for Markee
import { base } from 'wagmi/chains'
import type { Chain } from 'viem'
// All Markees are deployed on Base (canonical chain)
//
// FORK-TESTING ONLY — REMOVE BEFORE MAINNET. When NEXT_PUBLIC_BASE_RPC_URL points at a Base fork, we
// override the chain's rpcUrls so Privy embedded wallets broadcast writes through the fork (Privy reads
// chain.rpcUrls, not the wagmi transport). Same chainId (8453), so the ETHx permit domain is unchanged.
// External wallets still use their own RPC and are NOT fork-safe. Delete this override + the env var for prod.
const FORK_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL
export const CANONICAL_CHAIN: Chain = FORK_RPC
  ? {
      ...base,
      rpcUrls: {
        ...base.rpcUrls,
        default: { http: [FORK_RPC] },
        privyWalletOverride: { http: [FORK_RPC] },
      },
    }
  : base
export const CANONICAL_CHAIN_ID = base.id
// MARKEE token address (same across all chains)
export const MARKEE_TOKEN = '0xee3027f1e021b09D629922D40436C5DeA3c6cb38' as const
// Partner Reserve Distributor (Base only)
export const PARTNER_RESERVE_DISTRIBUTOR = '0x7FD2aF60B309f872a2cDAcCa853A9F7885466577' as const
// Markee Cooperative multisig — default beneficiary for non-partner strategies
export const COOPERATIVE_MULTISIG = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB' as const

// RevNet v6 config — JB terminal and project ID on Base
export const REVNET_V6_CONFIG = {
  [base.id]: {
    projectId: 152,
    terminal: '0x2dB6d704058E552DeFE415753465df8dF0361846' as const,
  },
} as const

// V1.3 LeaderboardFactory contract addresses
export const FACTORIES = {
  SUPERFLUID: '0xC497187AAa35C26b0008B43C10A6F6300b7eBcad' as const,
  OPEN_INTERNET: '0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c' as const,
  GITHUB: '0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2' as const,
} as const

// StreamingLeaderboardFactory — not yet deployed on Base mainnet (gated on the Superfluid governance
// setAppRegistrationKey). Set NEXT_PUBLIC_STREAMING_FACTORY to the deployed (or anvil-fork) factory
// address to light up the streaming listing + create flow; unset/invalid keeps the feature hidden.
export const STREAMING_FACTORY = (process.env.NEXT_PUBLIC_STREAMING_FACTORY ?? '') as `0x${string}` | ''
export const STREAMING_ENABLED = /^0x[0-9a-fA-F]{40}$/.test(STREAMING_FACTORY)

// Fixed-price strategy contracts (in use for the fixed-price messages on the home page)
export const CONTRACTS = {
  [base.id]: {
    fixedPriceStrategies: [
      {
        name: 'this is a sign.',
        address: '0x2D3889567e26B5d944f81C8Da3521fF713B803fD' as const,
      },
      {
        name: 'anyone can pay to change.',
        address: '0x0F5c796e985f2eac6C82429a2313F354e114329d' as const,
      },
      {
        name: 'that funds the internet.',
        address: '0x91a5bd98d4e43bF49BEd7203641159829cd2ff81' as const,
      },
    ],
  },
} as const
