import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/rate-limit'
import { checkoutAlert } from '@/lib/checkout-alerts'
import { logger } from '@/lib/server/logger'
import { withServerError } from '@/lib/server/withServerError'
import { readLimitedJsonBody, RequestBodyTooLargeError } from '@/lib/sdk/gardens/body'
import { CLIENT_ERROR_LIMITS, clientErrorDeps, clientErrorForwarding, sanitizePathname, sanitizeReportText } from '@/lib/server/client-errors'

const MAX_BODY_BYTES = 16_384
const MAX_VALUE_LENGTH = 4_000

export const POST = withServerError('POST /api/errors', async (request: NextRequest) => {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const { max, windowSeconds } = CLIENT_ERROR_LIMITS.perIp
  if (!await clientErrorDeps.underRateLimit('client-errors', clientIp(request), max, windowSeconds)) {
    return NextResponse.json({ error: 'Too many reports' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await readLimitedJsonBody(request, MAX_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    body = null
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid error report' }, { status: 400 })
  }

  const report = body as Record<string, unknown>
  if (report.type === 'checkout') {
    const context = checkoutAlert(report)
    if (!context) return NextResponse.json({ error: 'Invalid checkout stage' }, { status: 400 })
    await logger.error('Checkout client failure', { name: 'CheckoutError', message: context.code }, context)
    return new NextResponse(null, { status: 204 })
  }

  const message = sanitizeReportText(report.message, 1_000)
  if (!message) {
    return NextResponse.json({ error: 'Missing error message' }, { status: 400 })
  }

  const clientError = new Error(message)
  clientError.name = sanitizeReportText(report.name, 200) || 'ClientError'
  clientError.stack = sanitizeReportText(report.stack, MAX_VALUE_LENGTH)
  const digest = sanitizeReportText(report.digest, 200)
  const context = {
    digest,
    componentStack: sanitizeReportText(report.componentStack, MAX_VALUE_LENGTH),
    pathname: sanitizePathname(report.pathname),
    userAgent: sanitizeReportText(request.headers.get('user-agent'), 500),
  }

  const decision = await clientErrorForwarding(clientError.name, message, digest)
  if (decision === 'forward') await logger.error('Client error', clientError, context)
  else console.error(`[Client error] not forwarded (${decision})`, clientError, context)

  return new NextResponse(null, { status: 204 })
})
