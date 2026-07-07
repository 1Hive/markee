// frontend/app/api/github/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  // Used only for early-exit errors before we can read siteOrigin from state.
  const fallbackBase = `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github`

  if (!code || !state) {
    return NextResponse.redirect(`${fallbackBase}?error=missing_params`)
  }

  const raw = await kv.getdel(`github:oauth:state:${state}`)
  if (!raw) {
    return NextResponse.redirect(`${fallbackBase}?error=invalid_state`)
  }

  let returnTo = ''
  // Use the origin that initiated the flow so staging/preview deploys redirect back
  // to themselves rather than to production.
  let siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
    returnTo = payload.returnTo ?? ''
    if (payload.origin) siteOrigin = payload.origin
  } catch {
    // state was stored as plain '1' by old connect route — treat as no returnTo
  }

  const base = `${siteOrigin}/ecosystem/platforms/github`

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_REDIRECT_URI,
    }),
  })
  const tokenData = await tokenRes.json()
  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(`${base}?error=token_exchange_failed`)
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  })
  const user = await userRes.json()
  if (!user.id) {
    return NextResponse.redirect(`${base}?error=user_fetch_failed`)
  }

  await kv.set(
    `github:user:${user.id}`,
    JSON.stringify({
      accessToken: tokenData.access_token,
      login: user.login,
      avatarUrl: user.avatar_url,
      installedAt: new Date().toISOString(),
    }),
    { ex: 60 * 60 * 24 * 365 }
  )

  const response = NextResponse.redirect(
    returnTo === 'modal'
      ? `${base}?modal=create`
      : returnTo
        ? `${siteOrigin}${returnTo}`
        : base
  )

  response.cookies.set('github_uid', String(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  return response
}
