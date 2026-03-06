// middleware.ts (markee.xyz root)
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_ORIGINS = [
  'https://markee.xyz',
  'https://www.markee.xyz',
  'https://app.gardens.fund',
]

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const isAllowed = ALLOWED_ORIGINS.includes(origin)

  // Handle preflight before any redirect logic touches it
  if (req.method === 'OPTIONS' && isAllowed) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
