import type { Metadata } from 'next'
import { Manrope, JetBrains_Mono } from 'next/font/google'
import { Web3Provider } from '@/components/providers/Web3Provider'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'Markee - a sign anyone can pay to edit.',
  description: 'open source digital real estate - for sale or lease on a website near you 🪧',
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
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  )
}
