import type { Metadata } from 'next'
import { Barlow, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Web3Provider } from '@/components/providers/Web3Provider'

const barlow = Barlow({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-barlow',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
})

export const metadata: Metadata = {
  title: 'Markee - Digital Real Estate',
  description: 'Markee is a sign anyone can pay to edit that funds websites, daos, communities, open source, and more',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${barlow.className} ${jetbrainsMono.variable}`}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  )
}
