// frontend/app/api/github/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

// Popup-mode response: postMessage the result back to the window that opened us, then close --
// used instead of a redirect so the host page (which may have this open from inside a modal) never
// navigates away. targetOrigin is set explicitly (not '*') since this carries the connected login.
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function popupResponse(payload: { success: boolean; login?: string; error?: string }, targetOrigin: string) {
  const html = `<!DOCTYPE html><html><body style="background:#060A2A;color:#8A8FBF;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>${payload.success ? 'Connected — you can close this window.' : 'Something went wrong — you can close this window.'}</p>
<script>
  (function () {
    var payload = ${scriptJson({ source: 'markee-github-oauth', ...payload })};
    var targetOrigin = ${scriptJson(targetOrigin)};
    if (window.opener) { window.opener.postMessage(payload, targetOrigin); window.close(); }
  })();
</script>
</body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}

// Defense-in-depth on the origin read back from KV state before it becomes the postMessage
// target and redirect base. The legitimate flow can cross deployments (connect on a staging or
// preview deploy, GitHub redirecting to the one registered callback URL), so exact equality with
// the callback origin is too strict -- accept any known deployment origin instead. The primary
// guard is the one-time KV state token; this allowlist only bounds where the popup result can be
// delivered, so anyone able to deploy under the 1hive Vercel team is already inside the trust
// boundary it draws.
function isTrustedSiteOrigin(origin: string, requestOrigin: string): boolean {
  if (origin === requestOrigin) return true
  try {
    const { protocol, hostname } = new URL(origin)
    if (protocol !== 'https:' && !(protocol === 'http:' && hostname === 'localhost')) return false
    return (
      hostname === 'markee.xyz' ||
      hostname.endsWith('.markee.xyz') ||
      (hostname.startsWith('markee-') && hostname.endsWith('-1hive.vercel.app')) ||
      hostname === 'localhost'
    )
  } catch {
    return false
  }
}

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
  let popup = false
  // Use the origin that initiated the flow so staging/preview deploys redirect back
  // to themselves rather than to production.
  let siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
    returnTo = payload.returnTo ?? ''
    popup = payload.popup === true
    if (payload.origin) siteOrigin = payload.origin
  } catch {
    // state was stored as plain '1' by old connect route — treat as no returnTo
  }

  const requestOrigin = new URL(request.url).origin
  if (!isTrustedSiteOrigin(siteOrigin, requestOrigin)) {
    console.warn(`[github/callback] state origin ${siteOrigin} is not a known deployment, using ${requestOrigin}`)
    siteOrigin = requestOrigin
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
    return popup
      ? popupResponse({ success: false, error: 'GitHub sign-in failed.' }, siteOrigin)
      : NextResponse.redirect(`${base}?error=token_exchange_failed`)
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  })
  const user = await userRes.json()
  if (!user.id) {
    return popup
      ? popupResponse({ success: false, error: 'Could not read your GitHub account.' }, siteOrigin)
      : NextResponse.redirect(`${base}?error=user_fetch_failed`)
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

  const response = popup
    ? popupResponse({ success: true, login: user.login }, siteOrigin)
    : NextResponse.redirect(
        returnTo === 'modal'
          ? `${base}?modal=create`
          : returnTo
            ? `${siteOrigin}${returnTo}`
            : base
      )

  const callbackHostname = new URL(request.url).hostname
  const cookieDomain = callbackHostname === 'markee.xyz' || callbackHostname.endsWith('.markee.xyz')
    ? '.markee.xyz'
    : undefined

  response.cookies.set('github_uid', String(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    domain: cookieDomain,
  })

  return response
}
