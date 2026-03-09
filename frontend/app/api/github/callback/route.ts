// frontend/app/api/github/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=missing_params`
    )
  }

  const storedState = await kv.get(`github:oauth:state:${state}`)
  if (!storedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=invalid_state`
    )
  }

  await kv.del(`github:oauth:state:${state}`)

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
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=token_exchange_failed`
    )
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  })
  const user = await userRes.json()

  if (!user.id) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=user_fetch_failed`
    )
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

  // Set a session cookie so the frontend knows who is connected
  const redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github`
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set('github_uid', String(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  return response
}
