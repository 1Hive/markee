'use client'
import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit'
import { Wallet, User } from 'lucide-react'
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
                <div className="flex items-center gap-2">
                  <a
                    href="/account"
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#0A0F3D] border border-[#8A8FBF]/30 text-[#8A8FBF] hover:text-[#F897FE] hover:border-[#F897FE]/60 transition-colors"
                    title="My Markees"
                  >
                    <User size={18} />
                  </a>
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
