'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAccount, useWriteContract } from 'wagmi'
import { useSendTransaction, useWallets } from '@privy-io/react-auth'
import { encodeFunctionData, type Abi, type Address, type Hex } from 'viem'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'

// Drop-in replacement for wagmi's useWriteContract that has Privy pay the gas for embedded wallets.
//
// Privy's dashboard "Sponsor gas fees" toggle only makes sponsorship *available*. It applies only
// when a transaction goes through Privy's own sendTransaction with `sponsor: true`. A wagmi
// writeContract sent through the embedded-wallet connector is an ordinary self-paid transaction, so
// a fresh email/Google/Apple/passkey account (0 ETH) fails with "insufficient funds for gas".
//
// Routing:
// - Active wagmi account is a Privy embedded wallet on the canonical chain -> encode the call and
//   send it with Privy's sendTransaction({ sponsor: true }).
// - Anything else (external wallets like MetaMask/Rabby, the E2E mock connector) -> wagmi's own
//   writeContractAsync, unchanged. Privy cannot sponsor wallets it doesn't control.
//
// A failed sponsored send is never retried as a self-paid send: a failure after broadcast would
// otherwise duplicate the transaction (see AGENTS.md "never automatically resubmit").

type WagmiWrite = ReturnType<typeof useWriteContract>

type LooseWriteParams = {
  address: Address
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  value?: bigint
  chainId?: number
}

export function isEmbeddedWalletType(walletClientType: string | undefined): boolean {
  return walletClientType === 'privy' || walletClientType === 'privy-v2'
}

const WALLETS_READY_TIMEOUT_MS = 5_000
export const WALLET_LOADING_MESSAGE = 'Your wallet is still loading. Please try again in a moment.'

type PrivyWallet = ReturnType<typeof useWallets>['wallets'][number]

function findEmbedded(wallets: PrivyWallet[], address: string | undefined): PrivyWallet | undefined {
  const active = address ? wallets.find(w => w.address.toLowerCase() === address.toLowerCase()) : undefined
  return active && isEmbeddedWalletType(active.walletClientType) ? active : undefined
}

export function useSponsoredWriteContract() {
  const { address, chainId: accountChainId } = useAccount()
  const { wallets, ready: walletsReady } = useWallets()
  const { sendTransaction } = useSendTransaction()
  const { writeContractAsync: wagmiWriteContractAsync } = useWriteContract()

  // The Privy embedded wallet wagmi is signing with, if any. External wallets resolve to undefined.
  const embedded = useMemo(() => findEmbedded(wallets, address), [address, wallets])

  // Latest wallet state for send(), which may run before Privy's wallet list has loaded (a brand-new
  // user clicking Deploy right after sign-in). Routing on an empty list would silently fall back to
  // the self-paid wagmi path and fail with "insufficient funds for gas", so send() waits for it.
  const latest = useRef({ wallets, walletsReady, address })
  latest.current = { wallets, walletsReady, address }

  const send = useCallback(async (params: LooseWriteParams): Promise<Hex> => {
    const chainId = params.chainId ?? accountChainId
    const deadline = Date.now() + WALLETS_READY_TIMEOUT_MS
    while (!latest.current.walletsReady && Date.now() < deadline) await new Promise(r => setTimeout(r, 100))
    // Never fall back to the self-paid path just because Privy is slow: for an embedded wallet that
    // means "insufficient funds for gas" (or asking a new user to pay gas). Ask them to retry.
    if (!latest.current.walletsReady) throw new Error(WALLET_LOADING_MESSAGE)
    const signer = findEmbedded(latest.current.wallets, latest.current.address)
    if (signer && chainId === CANONICAL_CHAIN.id) {
      const data = encodeFunctionData({
        abi: params.abi as Abi,
        functionName: params.functionName,
        args: params.args as unknown[] | undefined,
      })
      const { hash } = await sendTransaction(
        { to: params.address, data, value: params.value ?? 0n, chainId },
        { address: signer.address, sponsor: true, uiOptions: { showWalletUIs: true } },
      )
      return hash
    }
    return wagmiWriteContractAsync(params as Parameters<WagmiWrite['writeContractAsync']>[0])
  }, [accountChainId, sendTransaction, wagmiWriteContractAsync])

  const mutation = useMutation<Hex, Error, LooseWriteParams>({ mutationFn: send })

  return {
    // Cast back to wagmi's signatures so call sites keep ABI-typed functionName/args checking.
    writeContract: mutation.mutate as unknown as WagmiWrite['writeContract'],
    writeContractAsync: mutation.mutateAsync as unknown as WagmiWrite['writeContractAsync'],
    data: mutation.data,
    error: mutation.error,
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
    // True when the signer is a Privy embedded wallet, so its canonical-chain writes (every caller
    // passes chainId: CANONICAL_CHAIN.id, which is what send() routes on) are gas-sponsored.
    sponsored: !!embedded,
    // Whether balance checks should hold ETH back for gas. Only once Privy's wallets have loaded and
    // the signer is definitely not sponsored: before that, reserving gas would block a brand-new
    // 0-ETH embedded user whose payment send() is about to sponsor.
    needsGasReserve: walletsReady && !embedded,
  }
}
