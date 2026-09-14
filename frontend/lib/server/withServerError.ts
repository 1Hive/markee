import 'server-only'

import { NextResponse } from 'next/server'
import { logger } from './logger'

type RouteHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>

function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('digest' in error)) return false
  const digest = String(error.digest)
  return digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_')
}

function requestContext(args: unknown[]): Record<string, unknown> {
  const request = args.find(value => value instanceof Request)
  if (!(request instanceof Request)) return {}

  let pathname = 'unknown'
  try {
    pathname = new URL(request.url).pathname
  } catch {
    // Keep malformed URLs out of the report because they may contain credentials.
  }

  return { method: request.method, pathname }
}

export function withServerError<Args extends unknown[]>(
  name: string,
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args)
    } catch (error) {
      // Next uses thrown values for redirects, not-found responses, and static/dynamic
      // rendering signals. They must reach the framework unchanged.
      if (isNextControlFlowError(error)) throw error
      await logger.error(name, error, requestContext(args))
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
