import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base, mainnet } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'Markee',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
  chains: [base, mainnet], // Mainnet for ENS resolution
  ssr: true,
})
