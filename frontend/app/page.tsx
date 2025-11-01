import Link from 'next/link'
import { ConnectButton } from '@/components/wallet/ConnectButton'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-blue-600">Markee</h1>
            <nav className="flex gap-6">
              <Link href="/" className="text-blue-600 font-medium">Home</Link>
              <Link href="/investors" className="text-gray-600 hover:text-gray-900">For Investors</Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Markee
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            A community-first digital marketing platform
          </p>
          <p className="text-gray-500">
            Leaderboard coming soon...
          </p>
        </div>
      </main>
    </div>
  )
}
