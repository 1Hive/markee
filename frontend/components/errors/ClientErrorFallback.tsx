'use client'

import { useEffect } from 'react'

type ClientError = Error & {
  digest?: string
  componentStack?: string
}

export function ClientErrorFallback({
  error,
  reset,
}: {
  error: ClientError
  reset: () => void
}) {
  useEffect(() => {
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        componentStack: error.componentStack,
        pathname: window.location.pathname,
      }),
    }).catch(() => {
      // Error reporting must never create another user-facing error.
    })
  }, [error])

  return (
    <main className="min-h-screen bg-[#0a0e27] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-purple-300">
          Something went wrong
        </p>
        <h1 className="mt-3 text-3xl font-semibold">We hit an unexpected error.</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">
          The error has been reported. You can retry the page now.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 rounded-xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-offset-2 focus:ring-offset-[#0a0e27]"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
