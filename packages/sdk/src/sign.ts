import { escapeHtml, formatEth } from './amount.js';
import { MarkeeClient } from './client.js';
import { createMarkee } from './modal.js';
import { fundingPresets } from './presentation.js';
import { createThemeController } from './theme.js';
import { lightLogo, darkLogo } from './logo-data.js';
import type { Entry, Placement, SDKOptions, Snapshot } from './types.js';

export interface MarkeeSignOptions extends SDKOptions {
  placement: Placement;
  /** Make the sign a button that opens the payment modal. Defaults to true. */
  showAction?: boolean;
  /** Open a host-controlled modal instead of the sign's built-in SDK modal. */
  onOpen?: () => void;
  /** Refresh board and moderation state while mounted. Minimum 10 seconds; default 30 seconds. */
  refreshIntervalMs?: number;
}

/** Board flags apply on integrations; Markee-only site flags deliberately do not. */
export function signContent(snapshot: Snapshot): { entry: Entry | null; visibility: 'visible' | 'flagged' | 'unavailable' } {
  const entry = snapshot.entries.find(item => item.address.toLowerCase() === snapshot.top?.toLowerCase()) ?? null;
  return { entry, visibility: !entry || entry.moderated === null ? 'unavailable' : entry.moderated ? 'flagged' : 'visible' };
}

const css = `
:host{display:block;color:var(--markee-text);font-family:var(--markee-font-family);color-scheme:var(--markee-color-scheme)}
*,*::before,*::after{box-sizing:border-box}
.sign{appearance:none;position:relative;isolation:isolate;display:flex;align-items:center;justify-content:center;width:100%;min-height:104px;padding:28px 20px;border:1px solid var(--markee-border);border-radius:var(--markee-card-radius);background:var(--markee-surface);color:var(--markee-text);font:inherit;text-align:center;overflow:visible}
button.sign{cursor:pointer}
button.sign:hover{background:var(--markee-sign-hover-background);border-color:var(--markee-accent-border);box-shadow:0 6px 22px color-mix(in srgb,var(--markee-accent) 16%,transparent)}
button.sign:focus-visible{outline:3px solid var(--markee-focus-ring);outline-offset:3px}
.watermark{position:absolute;z-index:0;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:inherit;pointer-events:none}
.watermark img{height:100%;width:auto;max-width:none;opacity:0;transition:opacity 200ms ease}
.watermark .logo-light{display:none}
:host([data-markee-theme="dark"]) .watermark .logo-light{display:block}
:host([data-markee-theme="dark"]) .watermark .logo-dark{display:none}
button.sign:hover .watermark img,button.sign:focus-visible .watermark img{opacity:var(--markee-sign-hover-logo-opacity)}
.sign.has-rate{margin-bottom:12px}
.views{position:absolute;z-index:1;top:9px;right:12px;display:inline-flex;align-items:center;gap:4px;color:var(--markee-muted);font-size:11px;line-height:1}
.views svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.4}
.message{position:relative;z-index:1;font-family:ui-monospace,monospace;font-size:17px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;max-width:100%}
.obscured{filter:blur(8px);user-select:none;pointer-events:none}
.veil{position:absolute;z-index:2;inset:25px 12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--markee-surface) 75%,transparent);color:var(--markee-muted);font-size:13px;text-align:center;padding:12px}
.notice{position:relative;z-index:1;color:var(--markee-muted);font-size:13px;margin:0}
.rate{position:absolute;z-index:3;bottom:-12px;left:50%;transform:translateX(-50%);max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:8px;background:var(--markee-accent);color:var(--markee-accent-text);box-shadow:0 7px 20px color-mix(in srgb,var(--markee-accent) 35%,transparent);padding:4px 13px;font-family:ui-monospace,monospace;font-size:11px;font-weight:700;line-height:1.2}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

/** @internal Pure renderer kept separate so hidden-content behavior can be verified. */
export function signHtml(snapshot: Snapshot | null, showAction: boolean, unavailable = false): string {
  const board = snapshot?.name || 'Markee';
  const { entry, visibility } = snapshot ? signContent(snapshot) : { entry: null, visibility: 'unavailable' as const };
  const body = unavailable ? '<span class="notice" role="status">Markee sign is temporarily unavailable.</span>'
    : !snapshot ? '<span class="notice" role="status">Loading the Markee sign…</span>'
      : !entry ? '<span class="notice">The sign is waiting for its first message.</span>'
        : visibility === 'unavailable' ? '<span class="notice" role="status">Message unavailable while moderation loads.</span>'
          : `<span class="message ${visibility === 'flagged' ? 'obscured' : ''}" ${visibility === 'flagged' ? 'aria-hidden="true"' : ''}>${escapeHtml(entry.message)}</span>${visibility === 'flagged' ? '<span class="veil" role="status">This message has been flagged.</span>' : ''}`;
  const views = entry?.views === null || entry?.views === undefined ? '' : `<span class="views" aria-label="${entry.views.toLocaleString()} views"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M1.3 8s2.4-4 6.7-4 6.7 4 6.7 4-2.4 4-6.7 4S1.3 8 1.3 8Z"/><circle cx="8" cy="8" r="2"/></svg>${entry.views.toLocaleString()}</span>`;
  const rate = snapshot?.strategy === 'rent' && entry ? `<span class="rate">${formatEth(fundingPresets(snapshot).boost.toString())} ETH/mo to change</span>` : '';
  const tag = showAction ? 'button' : 'div';
  const attributes = showAction ? `type="button" data-markee-open title="Open ${escapeHtml(board)} Markee"` : `aria-label="${escapeHtml(board)} Markee sign"`;
  const watermark = showAction ? `<span class="watermark" aria-hidden="true"><img class="logo-dark" src="${darkLogo}" alt=""><img class="logo-light" src="${lightLogo}" alt=""></span>` : '';
  return `<style>${css}</style><${tag} class="sign${rate ? ' has-rate' : ''}" ${attributes}>${watermark}${views}${body}${rate}</${tag}>`;
}

/** Mount a live, isolated sign in any app. The Markee API supplies its content and moderation status. */
export function createMarkeeSign(container: HTMLElement, options: MarkeeSignOptions) {
  if (typeof document === 'undefined') throw new Error('Mount the Markee sign in a browser.');
  const host = document.createElement('div');
  host.setAttribute('data-markee-sign', '');
  const root = host.attachShadow({ mode: 'open' });
  container.appendChild(host);
  const theme = createThemeController(host, options.theme);
  const client = new MarkeeClient(options);
  let modal: ReturnType<typeof createMarkee> | undefined;
  const interval = Number.isFinite(options.refreshIntervalMs) ? Math.max(10_000, options.refreshIntervalMs!) : 30_000;
  let active = true;
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: IntersectionObserver | undefined;
  const viewed = new Set<string>();
  let snapshot: Snapshot | null = null;
  const render = (unavailable = false) => {
    observer?.disconnect();
    root.innerHTML = signHtml(snapshot, options.showAction !== false, unavailable);
    if (unavailable || !snapshot || typeof IntersectionObserver === 'undefined') return;
    const { entry, visibility } = signContent(snapshot);
    if (!entry || visibility !== 'visible') return;
    const key = `${entry.address}:${entry.message}`;
    if (viewed.has(key)) return;
    observer = new IntersectionObserver(items => {
      if (!items.some(item => item.isIntersecting)) return;
      observer?.disconnect();
      viewed.add(key);
      void client.recordView(entry.address, entry.message, window.location.origin).catch(() => { viewed.delete(key); });
    }, { threshold: 0.5 });
    observer.observe(host);
  };
  const refresh = async () => {
    if (!active) return;
    clearTimeout(timer);
    request?.abort();
    const current = new AbortController();
    request = current;
    try {
      const next = await client.snapshot(options.placement, null, undefined, current.signal);
      if (active && request === current) { snapshot = next; render(); }
    } catch {
      if (active && request === current && !current.signal.aborted) { snapshot = null; render(true); }
    } finally {
      if (active && request === current) timer = setTimeout(() => void refresh(), interval);
    }
  };
  root.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-markee-open]')) {
      if (options.onOpen) { options.onOpen(); return; }
      modal ??= createMarkee(options);
      modal.open({ placement: options.placement });
    }
  });
  render();
  if (options.siteUrl) client.registerSite(options.placement);
  void refresh();
  return {
    refresh,
    setTheme: theme.set,
    destroy() { active = false; request?.abort(); clearTimeout(timer); observer?.disconnect(); modal?.close(); theme.destroy(); host.remove(); },
  };
}
