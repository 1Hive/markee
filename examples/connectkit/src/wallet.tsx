import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ConnectKitProvider, getDefaultConfig, useModal } from 'connectkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, useAccount, useConfig, WagmiProvider } from 'wagmi';
import { getAccount, watchAccount } from 'wagmi/actions';
import { injected } from 'wagmi/connectors';
import { base, mainnet, optimism, arbitrum, polygon, gnosis, celo, sepolia, optimismSepolia, arbitrumSepolia } from 'wagmi/chains';
import type { EIP1193Provider, WalletAdapter } from '@markee_team/sdk';

const chains = [base, mainnet, optimism, arbitrum, polygon, gnosis, celo, sepolia, optimismSepolia, arbitrumSepolia] as const;
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
// Wallet transports are public defaults. Markee reads, balances, simulations and
// receipts go exclusively through the Markee API and need no app RPC API key.
export const config = createConfig(projectId ? getDefaultConfig({
  appName: 'Markee × ConnectKit', walletConnectProjectId: projectId, chains,
  transports: Object.fromEntries(chains.map(chain => [chain.id, http()])),
}) : {
  chains, connectors: [injected()], transports: Object.fromEntries(chains.map(chain => [chain.id, http()])),
});
const queryClient = new QueryClient();
export function WalletProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}><ConnectKitProvider>{children}</ConnectKitProvider></QueryClientProvider></WagmiProvider>;
}

/** ConnectKit owns connection and account selection; the SDK borrows its provider. */
export function useMarkeeWallet(): WalletAdapter {
  const config = useConfig();
  const modal = useModal();
  const account = useAccount();
  const latest = useRef({ modal, account }); latest.current = { modal, account };
  const pendingCancel = useRef<(() => void) | null>(null);
  useEffect(() => () => pendingCancel.current?.(), []);
  return useMemo(() => {
    const getProvider = async () => {
      const account = getAccount(config);
      return account.isConnected && account.connector ? await account.connector.getProvider() as EIP1193Provider : null;
    };
    return {
      getProvider,
      async connect() {
        const current = await getProvider();
        if (current) return current;
        return new Promise<EIP1193Provider>((resolve, reject) => {
          let finished = false;
          let sawOpen = false;
          const finish = (provider?: EIP1193Provider, error?: Error) => {
            if (finished) return;
            finished = true; unwatch(); clearInterval(timer); pendingCancel.current = null;
            if (provider) resolve(provider); else reject(error || new Error('Wallet connection cancelled.'));
          };
          const check = async () => {
            try { const provider = await getProvider(); if (provider) finish(provider); }
            catch (error) { finish(undefined, error instanceof Error ? error : new Error('Could not connect wallet.')); }
          };
          const unwatch = watchAccount(config, { onChange: () => void check() });
          const timer = setInterval(() => {
            if (latest.current.modal.open) sawOpen = true;
            if (sawOpen && !latest.current.modal.open && !getAccount(config).isConnected) finish();
            else void check();
          }, 250);
          pendingCancel.current = () => finish();
          latest.current.modal.setOpen(true);
        });
      },
    };
  }, [config]);
}
