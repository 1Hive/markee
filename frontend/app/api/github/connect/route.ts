import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { kv } from '@vercel/kv'

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex')

  // Store state in KV with 10-minute TTL to validate on callback
  await kv.set(`github:oauth:state:${state}`, '1', { ex: 600 })

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
