import { NextRequest, NextResponse } from 'next/server'
import { clientIp, underRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/server/logger'
import { withServerError } from '@/lib/server/withServerError'

const MAX_BODY_BYTES = 16_384
const MAX_VALUE_LENGTH = 4_000

function limitedString(value: unknown, max = MAX_VALUE_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, max)
}

export const POST = withServerError('POST /api/errors', async (request: NextRequest) => {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  if (!await underRateLimit('client-errors', clientIp(request), 10, 60)) {
    return NextResponse.json({ error: 'Too many reports' }, { status: 429 })
  }

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid error report' }, { status: 400 })
  }

  const report = body as Record<string, unknown>
  const message = limitedString(report.message, 1_000)
  if (!message) {
    return NextResponse.json({ error: 'Missing error message' }, { status: 400 })
  }

  const clientError = new Error(message)
  clientError.name = limitedString(report.name, 200) ?? 'ClientError'
  clientError.stack = limitedString(report.stack)

  await logger.error('Client error', clientError, {
    digest: limitedString(report.digest, 200),
    componentStack: limitedString(report.componentStack),
    pathname: limitedString(report.pathname, 1_000),
    userAgent: limitedString(request.headers.get('user-agent'), 500),
  })

  return new NextResponse(null, { status: 204 })
})
