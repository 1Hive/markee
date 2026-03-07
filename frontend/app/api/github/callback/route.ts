import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // Validate required params
  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=missing_params`
    )
  }

  // Validate state to prevent CSRF
  const storedState = await kv.get(`github:oauth:state:${state}`)
  if (!storedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=invalid_state`
    )
  }

  // Clean up used state immediately
  await kv.del(`github:oauth:state:${state}`)

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_REDIRECT_URI,
    }),
  })

  const tokenData = await tokenRes.json()

  if (tokenData.error || !tokenData.access_token) {
    console.error('GitHub token exchange error:', tokenData)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=token_exchange_failed`
    )
  }

  // Fetch GitHub user identity
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json',
    },
  })

  const user = await userRes.json()

  if (!user.id) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github?error=user_fetch_failed`
    )
  }

  // Store token keyed by GitHub user ID
  // TTL: GitHub user tokens don't expire unless revoked, but we store
  // a long TTL here for hygiene. Refresh logic can be added later.
  await kv.set(
    `github:user:${user.id}`,
    JSON.stringify({
      accessToken: tokenData.access_token,
      login: user.login,
      avatarUrl: user.avatar_url,
      installedAt: new Date().toISOString(),
    }),
    { ex: 60 * 60 * 24 * 365 } // 1 year
  )

  // Redirect to onboarding — pass login so the page can greet them
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_SITE_URL}/ecosystem/platforms/github/onboard?login=${user.login}&uid=${user.id}`
  )
}
