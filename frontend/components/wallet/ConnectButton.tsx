'use client'
import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit'
import { useSwitchChain } from 'wagmi'
import { Wallet } from 'lucide-react'
import { base } from 'wagmi/chains'

export function ConnectButton() {
  const { switchChain } = useSwitchChain()

  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted
        const connected = ready && account && chain

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="bg-[#7C9CFF] text-[#060A2A] px-6 py-2 rounded-lg font-medium hover:bg-[#F897FE] flex items-center gap-2 transition-colors"
                  >
                    <Wallet size={20} />
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </button>
                )
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={() => switchChain({ chainId: base.id })}
                    type="button"
                    className="bg-[#FF8E8E] text-[#060A2A] px-6 py-2 rounded-lg font-medium hover:bg-[#FF8E8E]/80 flex items-center gap-2 transition-colors"
                  >
                    Switch Network to Base
                  </button>
                )
              }

              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="bg-[#7C9CFF] text-[#060A2A] px-4 py-2 rounded-lg font-medium hover:bg-[#F897FE] flex items-center gap-2 transition-colors"
                >
                  <Wallet size={20} />
                  <span className="hidden sm:inline">
                    {account.displayName}
                  </span>
                </button>
              )
            })()}
          </div>
        )
      }}
    </RainbowConnectButton.Custom>
  )
}
