'use client'

// E2E stand-in for @privy-io/wagmi, swapped in by next.config.js when NEXT_PUBLIC_E2E=1.
// Plain wagmi with a mock connector for E2E_ACCOUNT, auto-connected on load. The mock connector
// sends eth_sendTransaction / eth_sign to the chain's default RPC URL, so every chain is rewritten
// to point at the local fork: transactions are signed by Anvil's unlocked account, never a person.

import { useEffect, type ReactNode } from 'react'
import { WagmiProvider as BaseWagmiProvider, createConfig as baseCreateConfig, useAccount, useConnect, type CreateConfigParameters } from 'wagmi'
import { mock } from 'wagmi/connectors'
import type { Chain } from 'viem'

const RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'http://127.0.0.1:8545'
// The first account of the E2E mnemonic (tests/e2e/fork/env.ts), unlocked and funded by Anvil.
const ACCOUNT = process.env.NEXT_PUBLIC_E2E_ACCOUNT as `0x${string}`

export function createConfig(params: CreateConfigParameters) {
  const chains = params.chains.map(c => ({ ...c, rpcUrls: { ...c.rpcUrls, default: { http: [RPC] } } })) as unknown as readonly [Chain, ...Chain[]]
  return baseCreateConfig({
    ...params,
    chains,
    connectors: [mock({ accounts: [ACCOUNT], features: { reconnect: true } })],
  } as CreateConfigParameters)
}

// The `e2e-wallet=off` cookie keeps the wallet disconnected, for tests of the signed-out pages.
function AutoConnect() {
  const { isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  useEffect(() => {
    if (document.cookie.split('; ').includes('e2e-wallet=off')) return
    if (!isConnected && connectors[0]) connect({ connector: connectors[0] })
  }, [isConnected, connect, connectors])
  return null
}

export function WagmiProvider({ config, children }: { config: CreateConfigParameters & object; children: ReactNode }) {
  return (
    <BaseWagmiProvider config={config as never}>
      <AutoConnect />
      {children}
    </BaseWagmiProvider>
  )
}

export function useSetActiveWallet() {
  return { setActiveWallet: async () => {} }
}
