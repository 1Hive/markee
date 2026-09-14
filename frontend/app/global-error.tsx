'use client'

import { ClientErrorFallback } from '@/components/errors/ClientErrorFallback'

export default function GlobalError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <ClientErrorFallback {...props} />
      </body>
    </html>
  )
}
