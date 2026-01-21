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
