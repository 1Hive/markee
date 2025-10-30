import Link from 'next/link'

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-blue-600">Markee</Link>
          <nav className="flex gap-6">
            <Link href="/" className="text-gray-600 hover:text-gray-900">Home</Link>
            <Link href="/investors" className="text-blue-600 font-medium">For Investors</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-4xl font-bold text-gray-900 mb-8">Investment Information</h2>
        <p className="text-gray-600">
          RevNet tokenomics and roadmap coming soon...
        </p>
      </main>
    </div>
  )
}
