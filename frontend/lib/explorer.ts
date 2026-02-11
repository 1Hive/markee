/**
 * Block Explorer Config
 * 
 * Centralized explorer URL helpers. Currently Base-only but
 * designed for easy multi-chain expansion.
 */

import { base } from 'wagmi/chains'

const EXPLORER_URLS: Record<number, string> = {
  [base.id]: 'https://basescan.org',
}

export function getExplorerUrl(chainId: number): string {
  return EXPLORER_URLS[chainId] || 'https://basescan.org'
}

export function getTxUrl(chainId: number, txHash: string): string {
  return `${getExplorerUrl(chainId)}/tx/${txHash}`
}

export function getAddressUrl(chainId: number, address: string): string {
  return `${getExplorerUrl(chainId)}/address/${address}`
}

export function getBlockUrl(chainId: number, blockNumber: number | bigint): string {
  return `${getExplorerUrl(chainId)}/block/${blockNumber.toString()}`
}
