import type { Metadata } from 'next'
import { Barlow } from 'next/font/google'
import './globals.css'
import { Web3Provider } from '@/components/providers/Web3Provider'

const barlow = Barlow({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-barlow',
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
      <body className={barlow.className}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  )
}
