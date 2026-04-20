import type { Metadata } from 'next'
import { Manrope, JetBrains_Mono } from 'next/font/google'
import { Web3Provider } from '@/components/providers/Web3Provider'
import { NETWORK_PAUSED } from '@/lib/paused'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

export const metadata: Metadata = {
  title: 'Markee',
  description: 'open source digital real estate that funds the open internet 🪧',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#0a0e27] text-white antialiased">
        {NETWORK_PAUSED && (
          <div className="w-full bg-[#7C0000] text-white text-sm px-4 py-3 text-center font-medium z-50 relative">
            <span className="mr-2">&#9888;</span>
            The Markee network is paused. A vulnerability in Revnets v5 contracts has been responsibly disclosed -- we are working on migrating to the secure v6 version.{' '}
            <a
              href="https://discord.gg/BxuNakkS"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white/80"
            >
              Join the Markee Discord for updates.
            </a>
          </div>
        )}
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  )
}
