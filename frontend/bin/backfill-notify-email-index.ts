import { kv } from '@vercel/kv'
import { claimNotifyEmail, normalizeNotifyEmail } from '../lib/moderation/emailIndex'
import { kvEmailIndexStore } from '../lib/moderation/emailIndexStore'

interface NotifyRow { wallet: string; email: string; verified: boolean; verifiedAt?: number; setAt: number }
type StoredState = { email?: string; verified?: boolean; verifiedAt?: number; setAt?: number } | null

const PREFIX = 'moderation:notify:'
const notifyKey = (wallet: string) => `${PREFIX}${wallet.toLowerCase()}`
const apply = process.argv.includes('--apply')

async function readRows(): Promise<NotifyRow[]> {
  const keys: string[] = []
  let cursor: string | number = 0
  do {
    const [next, batch]: [string | number, string[]] = await kv.scan(cursor, { match: `${PREFIX}*`, count: 500 })
    keys.push(...batch)
    cursor = next
  } while (String(cursor) !== '0')
  const rows: NotifyRow[] = []
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500)
    const states = await kv.mget<StoredState[]>(...chunk)
    states.forEach((s, j) => {
      if (!s?.email) return
      rows.push({
        wallet: chunk[j].slice(PREFIX.length),
        email: normalizeNotifyEmail(s.email),
        verified: !!s.verified,
        verifiedAt: s.verifiedAt,
        setAt: s.setAt ?? 0,
      })
    })
  }
  return rows
}

const byPriority = (a: NotifyRow, b: NotifyRow) =>
  Number(b.verified) - Number(a.verified) || (a.verifiedAt ?? a.setAt) - (b.verifiedAt ?? b.setAt)

async function main() {
  const store = kvEmailIndexStore(notifyKey)
  const byEmail = new Map<string, NotifyRow[]>()
  for (const row of await readRows()) byEmail.set(row.email, [...byEmail.get(row.email) ?? [], row])

  let claimed = 0
  let pending = 0
  for (const [email, rows] of byEmail) {
    const [winner, ...others] = rows.sort(byPriority)
    if (others.length) console.log(`duplicate ${email}: index goes to ${winner.wallet}, also set on ${others.map(o => o.wallet).join(', ')}`)
    // The index holds verified emails only; pending ones are claimed when they verify.
    if (!winner.verified) { pending++; continue }
    if (!apply) { claimed++; continue }
    const result = await claimNotifyEmail(store, email, winner.wallet)
    if (result.ok) claimed++
    else console.log(`${email} already held by ${result.holder}, left as is`)
  }
  console.log(`${apply ? 'claimed' : 'would claim'} ${claimed}, skipped ${pending} unverified, ${byEmail.size} distinct emails`)
  if (!apply) console.log('dry run, pass --apply to write')
}

main().catch(e => { console.error(e); process.exit(1) })
