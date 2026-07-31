// Origin + headers for server-side fetches of our own API routes.
// Never derive the origin from the incoming request's Host header (SSRF: the header is
// caller-controlled, and these fetches carry the protection-bypass secret).
export function internalOrigin(): string {
  const host =
    process.env.VERCEL_ENV === 'production'
      ? // The generated deployment URL sits behind Deployment Protection even in production;
        // the project's production domain does not.
        process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
      : process.env.VERCEL_URL

  return host ? `https://${host}` : `http://localhost:${process.env.PORT ?? 3000}`
}

export function internalHeaders(): HeadersInit {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  return bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}
}
