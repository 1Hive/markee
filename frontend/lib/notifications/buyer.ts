import 'server-only'
import { kv } from '@vercel/kv'
import { erc20Abi, type Address } from 'viem'
import { escHtml, sendEmail, FROM } from '@/lib/moderation/email'
import { getModerationClient, notifyStateKey, type ModeratorNotifyState } from '@/lib/moderation/server'
import { notifyEventsOf } from '@/lib/moderation/queue'
import type { ActivityEvent } from '@/lib/activity/events'
import { StreamingLeaderboardABI } from '@/lib/contracts/abis'
import { STREAMING_BASE, CFA_FORWARDER_ABI, runwaySeconds } from '@/lib/superfluid/streaming'

// Buyer emails, sent to a wallet's verified notification email when the event is switched on in
// Settings: Message Status Change (one of your messages starts or stops winning, from the moderation
// scan's activity events) and Low Budget (your ETHx runs out within a day at the rate your winning
// streams spend it). "Every Time" sends each as it happens; "Daily Round-up" queues it for the
// daily digest cron.

const ACCOUNT_URL = 'https://markee.xyz/account'
const digestKey = (wallet: string) => `notify:buyer:digest:${wallet.toLowerCase()}`
// Set when a Low Budget alert goes out, cleared once the runway is back above a day, so each
// shortfall alerts once.
const lowBudgetKey = (wallet: string) => `notify:buyer:lowbudget:${wallet.toLowerCase()}`
const LOW_BUDGET_SECONDS = 86_400n
const LOW_BUDGET_CHECK_KEY = 'notify:buyer:lowbudget:lastcheck'
const LOW_BUDGET_CHECK_EVERY = 30 * 60

interface Recipient { wallet: string; email: string; state: ModeratorNotifyState }

async function recipients(wallets: string[], event: 'status' | 'budget'): Promise<Recipient[]> {
  if (wallets.length === 0) return []
  const rows = await kv.mget<(ModeratorNotifyState | null)[]>(...wallets.map(notifyStateKey))
  return wallets.flatMap((wallet, i) => {
    const state = rows[i]
    if (!state?.email || !state.verified || state.frequency === 'off' || !notifyEventsOf(state)[event]) return []
    return [{ wallet: wallet.toLowerCase(), email: state.email, state }]
  })
}

function page(title: string, body: string, cta: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:28px 28px 24px;border:1px solid #e5e5e5">
  <p style="font-size:12px;color:#999;letter-spacing:1px;text-transform:uppercase;margin:0 0 18px">Markee Protocol</p>
  <h1 style="font-size:20px;font-weight:700;color:#060A2A;margin:0 0 10px">${title}</h1>
  ${body}
  <a href="${ACCOUNT_URL}"
     style="display:inline-block;background:#F897FE;color:#060A2A;text-decoration:none;
            font-weight:700;padding:11px 22px;border-radius:8px;font-size:14px;margin-top:8px">
    ${cta}
  </a>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px">
  <p style="font-size:11px;color:#aaa;margin:0;line-height:1.6">
    You're receiving this because you turned these alerts on in your Markee account settings.
    <a href="${ACCOUNT_URL}?section=settings" style="color:#7C9CFF;text-decoration:none">Manage preferences</a>
  </p>
</div>
</body>
</html>`
}

const para = (html: string) => `<p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 14px">${html}</p>`

function statusLine(e: ActivityEvent): string {
  const msg = `&ldquo;${escHtml(e.message || 'Your message')}&rdquo;`
  return e.kind === 'winning' ? `${msg} is now the winning message.` : `${msg} was outbid and is no longer winning.`
}

function lowBudgetLine(runway: bigint): string {
  const hours = Number(runway / 3600n)
  return `Your stream balance runs out in about ${hours < 1 ? 'less than an hour' : `${hours} hour${hours === 1 ? '' : 's'}`}. When it does, your winning Rent bids stop streaming.`
}

interface DigestEntry { kind: 'status' | 'budget'; html: string; at: number }

async function deliver(r: Recipient, subject: string, entry: DigestEntry): Promise<number> {
  if (r.state.frequency === 'daily') {
    await kv.rpush(digestKey(r.wallet), entry)
    return 0
  }
  await sendEmail({ sender: FROM, to: [{ email: r.email }], subject, htmlContent: page(subject, para(entry.html), 'Open your account') })
  return 1
}

// One email per changed message, for the scan's buy-side winning/outbid events.
export async function notifyStatusChanges(byWallet: Map<string, ActivityEvent[]>): Promise<number> {
  const changes = new Map([...byWallet].map(([w, events]) => [w, events.filter(e => e.side === 'buy' && (e.kind === 'winning' || e.kind === 'outbid'))]))
  const wallets = [...changes].filter(([, events]) => events.length).map(([w]) => w)
  let sent = 0
  for (const r of await recipients(wallets, 'status')) {
    for (const e of changes.get(r.wallet) ?? []) {
      const subject = e.kind === 'winning' ? 'Your message is winning' : 'Your message was outbid'
      try { sent += await deliver(r, subject, { kind: 'status', html: statusLine(e), at: e.at }) }
      catch (err) { console.error('[notifications/buyer] status send failed', err) }
    }
  }
  return sent
}

// ETHx runway for each subscribed wallet at its winning streams' rate (the same rule as the
// dashboard's Stream Balance card). Runs at most every LOW_BUDGET_CHECK_EVERY seconds.
export async function notifyLowBudgets(streamingBoards: string[]): Promise<number> {
  if (streamingBoards.length === 0) return 0
  if (!await kv.set(LOW_BUDGET_CHECK_KEY, Date.now(), { nx: true, ex: LOW_BUDGET_CHECK_EVERY })) return 0

  const wallets: string[] = []
  let cursor = '0'
  do {
    const [next, keys] = await kv.scan(cursor, { match: notifyStateKey('*'), count: 500 })
    cursor = String(next)
    wallets.push(...keys.map(k => k.slice(notifyStateKey('').length)))
  } while (cursor !== '0')

  const client = getModerationClient()
  const ethx = STREAMING_BASE.ethx as Address
  let sent = 0
  for (const r of await recipients(wallets, 'budget')) {
    const wallet = r.wallet as Address
    const reads = await client.multicall({
      contracts: [
        { address: ethx, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] },
        ...streamingBoards.flatMap(board => [
          { address: board as Address, abi: StreamingLeaderboardABI, functionName: 'backerMarkee', args: [wallet] },
          { address: board as Address, abi: StreamingLeaderboardABI, functionName: 'topMarkee' },
          { address: STREAMING_BASE.cfaForwarder as Address, abi: CFA_FORWARDER_ABI, functionName: 'getFlowrate', args: [ethx, wallet, board as Address] },
        ]),
      ] as Parameters<typeof client.multicall>[0]['contracts'],
    })
    const balance = (reads[0]?.result as bigint | undefined) ?? 0n
    let rate = 0n
    streamingBoards.forEach((_, i) => {
      const backed = (reads[1 + i * 3]?.result as string | undefined)?.toLowerCase()
      const top = (reads[2 + i * 3]?.result as string | undefined)?.toLowerCase()
      if (backed && backed === top) rate += BigInt((reads[3 + i * 3]?.result as bigint | undefined) ?? 0n)
    })
    const runway = rate > 0n ? runwaySeconds(balance, rate) : null
    if (runway === null || runway >= LOW_BUDGET_SECONDS) { await kv.del(lowBudgetKey(r.wallet)); continue }
    if (!await kv.set(lowBudgetKey(r.wallet), Date.now(), { nx: true })) continue
    try { sent += await deliver(r, 'Your stream balance is running low', { kind: 'budget', html: lowBudgetLine(runway), at: Math.floor(Date.now() / 1000) }) }
    catch (err) {
      console.error('[notifications/buyer] low budget send failed', err)
      // Clear the marker so the next check retries the alert.
      await kv.del(lowBudgetKey(r.wallet)).catch(() => {})
    }
  }
  return sent
}

// Daily digest of what was queued for "Daily Round-up" wallets.
export async function sendBuyerDigests(): Promise<number> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, found] = await kv.scan(cursor, { match: digestKey('*'), count: 500 })
    cursor = String(next)
    keys.push(...found)
  } while (cursor !== '0')

  let sent = 0
  for (const key of keys) {
    const wallet = key.slice(digestKey('').length)
    const entries = await kv.lrange<DigestEntry>(key, 0, -1)
    const [r] = await recipients([wallet], 'status').then(async found => found.length ? found : recipients([wallet], 'budget'))
    if (!r || entries.length === 0) {
      await kv.del(key)
      continue
    }
    const subject = `Daily summary: ${entries.length} update${entries.length === 1 ? '' : 's'} on your messages`
    try {
      await sendEmail({ sender: FROM, to: [{ email: r.email }], subject, htmlContent: page(subject, entries.map(e => para(e.html)).join(''), 'Open your account') })
      // Drop only what was sent, after it was sent: a failed send keeps the digest for tomorrow,
      // and entries queued during the send stay for the next one.
      await kv.ltrim(key, entries.length, -1)
      sent++
    } catch (err) { console.error('[notifications/buyer] digest send failed', err) }
  }
  return sent
}
