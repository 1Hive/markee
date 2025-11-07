import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/ConnectButton'

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center">
              <img src="/markee-logo.png" alt="Markee" className="h-10 w-auto" />
            </Link>
            <nav className="flex gap-6">
              <Link href="/" className="text-gray-600 hover:text-gray-900">Leaderboard</Link>
              <Link href="/investors" className="text-markee font-medium">Info</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="text-6xl mb-6">🚧</div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Coming Soon</h2>
            <p className="text-lg text-gray-600 mb-8">
              We're working on bringing you detailed information about the Markee collective, tokenomics, and how to participate.
            </p>
            <div className="flex justify-center gap-4">
              <Link 
                href="/"
                className="bg-markee text-white px-6 py-3 rounded-lg font-semibold hover:bg-markee-600 transition-colors"
              >
                Back to Leaderboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
