// app/api/admin/backfill-github-contracts/route.ts
// ONE-TIME USE — delete this file after running.
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { getLinkedFiles } from '@/lib/github/linkedFiles'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (!process.env.ADMIN_SECRET || auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keys = await kv.keys('github:markee:*')
  const results = {
    written: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
  }

  for (const key of keys) {
    const address = (key as string).replace('github:markee:', '')
    try {
      const existing = await kv.get(`github:contract:${address}`)
      if (existing) {
        results.skipped.push(address)
        continue
      }

      const files = await getLinkedFiles(address)
      const primary = files[0]
      if (!primary || !primary.repoOwner || !primary.repoName) {
        results.errors.push(`${address}: no usable linked file`)
        continue
      }

      await kv.set(
        `github:contract:${address}`,
        { owner: primary.repoOwner, repo: primary.repoName, githubUserId: primary.linkedByUid },
        { ex: 60 * 60 * 24 * 365 * 5 }
      )
      results.written.push(address)
    } catch (err) {
      results.errors.push(`${address}: ${String(err)}`)
    }
  }

  return NextResponse.json(results)
}
