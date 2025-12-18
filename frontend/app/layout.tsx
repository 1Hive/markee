import type { Metadata } from 'next'
import { General_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Web3Provider } from '@/components/providers/Web3Provider'

const generalSans = General_Sans({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-general-sans',
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
      <body className={`${generalSans.className} ${jetbrainsMono.variable}`}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  )
}
