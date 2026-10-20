import 'server-only'
import { kv } from '@vercel/kv'
import { pendingKey, readModeratorNotifyStates } from './server'
import type { ModeratedBoard } from './server'

const BREVO_SMTP = 'https://api.brevo.com/v3/smtp/email'
export const FROM = { email: 'notifications@markee.xyz', name: 'Markee' }
const QUEUE_URL = 'https://markee.xyz/account'

interface BrevoPayload {
  sender: { email: string; name?: string }
  to: { email: string; name?: string }[]
  subject: string
  htmlContent: string
}

export async function sendEmail(payload: BrevoPayload): Promise<void> {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    console.warn('[moderation/email] BREVO_API_KEY not set, skipping')
    return
  }
  const res = await fetch(BREVO_SMTP, {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}

export function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHtml(boardName: string, boardAddress: string, count: number): string {
  const n = escHtml(String(count))
  const name = escHtml(boardName)
  const addr = escHtml(boardAddress)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:28px 28px 24px;border:1px solid #e5e5e5">
  <p style="font-size:12px;color:#999;letter-spacing:1px;text-transform:uppercase;margin:0 0 18px">Markee Protocol</p>
  <h1 style="font-size:20px;font-weight:700;color:#060A2A;margin:0 0 10px">
    ${n} message${count !== 1 ? 's' : ''} pending moderation
  </h1>
  <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 22px">
    New content is waiting for review on <strong>${name}</strong>.
    Open your moderation queue to approve or flag it.
  </p>
  <a href="${QUEUE_URL}"
     style="display:inline-block;background:#F897FE;color:#060A2A;text-decoration:none;
            font-weight:700;padding:11px 22px;border-radius:8px;font-size:14px">
    Open moderation queue
  </a>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px">
  <p style="font-size:11px;color:#aaa;margin:0;line-height:1.6">
    You're receiving this because you're a moderator on
    <strong>${name}</strong> (<span style="font-family:monospace">${addr}</span>).
    <a href="${QUEUE_URL}" style="color:#7C9CFF;text-decoration:none">Manage preferences</a>
  </p>
</div>
</body>
</html>`
}

function buildVerifyHtml(boardName: string, verifyUrl: string): string {
  const name = escHtml(boardName)
  const url = escHtml(verifyUrl)
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="background:#fff;border-radius:10px;max-width:520px;margin:0 auto;padding:28px 28px 24px;border:1px solid #e5e5e5">
  <p style="font-size:12px;color:#999;letter-spacing:1px;text-transform:uppercase;margin:0 0 18px">Markee Protocol</p>
  <h1 style="font-size:20px;font-weight:700;color:#060A2A;margin:0 0 10px">You've been added as a moderator</h1>
  <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 22px">
    You were added as a moderator on <strong>${name}</strong>.
    Verify your email to receive moderation notifications, then manage your preferences from your account.
  </p>
  <a href="${url}"
     style="display:inline-block;background:#F897FE;color:#060A2A;text-decoration:none;
            font-weight:700;padding:11px 22px;border-radius:8px;font-size:14px">
    Verify email &amp; open account
  </a>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px">
  <p style="font-size:11px;color:#aaa;margin:0;line-height:1.6">
    This link expires in 7 days. If you didn't expect this, you can ignore it.
  </p>
</div>
</body>
</html>`
}

export async function sendVerificationEmail(email: string, boardName: string, verifyUrl: string): Promise<void> {
  await sendEmail({
    sender: FROM,
    to: [{ email }],
    subject: `You've been added as a moderator on "${boardName}" — verify your email`,
    htmlContent: buildVerifyHtml(boardName, verifyUrl),
  })
}

export interface NotificationResult { sent: number; errors: number }

// Called right after a scan when new items are queued. Sends to moderators with frequency='every'
// and a verified email address.
export async function sendNewItemNotifications(
  pendingByBoard: Record<string, number>,
  boards: ModeratedBoard[],
): Promise<NotificationResult> {
  const boardAddrs = Object.keys(pendingByBoard).filter(a => (pendingByBoard[a] ?? 0) > 0)
  if (boardAddrs.length === 0) return { sent: 0, errors: 0 }

  const boardMap = new Map(boards.map(b => [b.address.toLowerCase(), b]))

  const results = await Promise.all(boardAddrs.map(async boardAddr => {
    const board = boardMap.get(boardAddr)
    if (!board) return { sent: 0, errors: 0 }
    const count = pendingByBoard[boardAddr] ?? 0
    const states = await readModeratorNotifyStates(board.moderators)
    const recipients = states.filter(s => s.verified && s.frequency === 'every' && s.events.mod)
    if (recipients.length === 0) return { sent: 0, errors: 0 }
    const sends = await Promise.all(recipients.map(async ({ email }) => {
      try {
        await sendEmail({
          sender: FROM,
          to: [{ email }],
          subject: `${count} new message${count !== 1 ? 's' : ''} pending review on "${board.name}"`,
          htmlContent: buildHtml(board.name, board.address, count),
        })
        return 1
      } catch (e) {
        console.error('[moderation/email] send failed to', email, e)
        return 0
      }
    }))
    const sent = sends.filter(Boolean).length
    return { sent, errors: sends.length - sent }
  }))
  return results.reduce((acc, r) => ({ sent: acc.sent + r.sent, errors: acc.errors + r.errors }), { sent: 0, errors: 0 })
}

// Called by the daily digest cron. Sends to moderators with frequency='daily' who have a verified
// email and whose boards have pending items.
export async function sendDailyDigest(boards: ModeratedBoard[]): Promise<NotificationResult> {
  if (boards.length === 0) return { sent: 0, errors: 0 }

  const counts = await Promise.all(
    boards.map(b => kv.zcard(pendingKey('board', b.address)).catch(() => 0)),
  )
  const boardsWithItems = boards.filter((_, i) => (counts[i] ?? 0) > 0)
  if (boardsWithItems.length === 0) return { sent: 0, errors: 0 }

  const results = await Promise.all(boardsWithItems.map(async board => {
    const count = counts[boards.indexOf(board)] ?? 0
    const states = await readModeratorNotifyStates(board.moderators)
    const recipients = states.filter(s => s.verified && s.frequency === 'daily' && s.events.mod)
    if (recipients.length === 0) return { sent: 0, errors: 0 }
    const sends = await Promise.all(recipients.map(async ({ email }) => {
      try {
        await sendEmail({
          sender: FROM,
          to: [{ email }],
          subject: `Daily summary: ${count} message${count !== 1 ? 's' : ''} pending review on "${board.name}"`,
          htmlContent: buildHtml(board.name, board.address, count),
        })
        return 1
      } catch (e) {
        console.error('[moderation/email] daily digest send failed to', email, e)
        return 0
      }
    }))
    const sent = sends.filter(Boolean).length
    return { sent, errors: sends.length - sent }
  }))
  return results.reduce((acc, r) => ({ sent: acc.sent + r.sent, errors: acc.errors + r.errors }), { sent: 0, errors: 0 })
}
