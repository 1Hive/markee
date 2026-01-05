'use client'
import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit'
import { Wallet } from 'lucide-react'

export function ConnectButton() {
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
                    onClick={openChainModal}
                    type="button"
                    className="bg-[#FF8E8E] text-[#060A2A] px-6 py-2 rounded-lg font-medium hover:bg-[#FF8E8E]/80 flex items-center gap-2 transition-colors"
                  >
                    Wrong network
                  </button>
                )
              }

              return (
                <div className="flex gap-2">
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="bg-[#0A0F3D] text-[#EDEEFF] px-3 py-2 rounded-lg font-medium hover:bg-[#0A0F3D]/80 flex items-center gap-2 transition-colors border border-[#8A8FBF]/30"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      chain.id === 10 ? 'bg-[#FF8E8E]' :
                      chain.id === 8453 ? 'bg-[#7C9CFF]' :
                      chain.id === 42161 ? 'bg-[#F897FE]' :
                      chain.id === 1 ? 'bg-[#8BC8FF]' :
                      'bg-[#8A8FBF]'
                    }`} />
                    <span className="hidden sm:inline">{chain.name}</span>
                  </button>

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
                </div>
              )
            })()}
          </div>
        )
      }}
    </RainbowConnectButton.Custom>
  )
}
