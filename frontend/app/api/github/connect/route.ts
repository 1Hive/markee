// frontend/app/api/github/connect/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  // Caller passes ?returnTo=modal to get redirected back into the modal after OAuth
  const returnTo = searchParams.get('returnTo') ?? ''

  const state = crypto.randomBytes(16).toString('hex')

  // Store state with returnTo payload — 10-minute TTL
  await kv.set(
    `github:oauth:state:${state}`,
    JSON.stringify({ returnTo }),
    { ex: 600 }
  )

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: process.env.GITHUB_REDIRECT_URI!,
    scope: 'repo public_repo',
    state,
  })

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  )
}
