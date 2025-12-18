import type { Metadata } from 'next'
import { Barlow, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { Web3Provider } from '@/components/providers/Web3Provider'

const barlow = Barlow({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-barlow',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-source-serif',
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
      <body className={`${barlow.className} ${sourceSerif.variable}`}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  )
}
