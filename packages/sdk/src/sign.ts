import { escapeHtml, shortAddress } from './amount.js';
import { MarkeeClient } from './client.js';
import { createMarkee } from './modal.js';
import { createThemeController } from './theme.js';
import type { Entry, Placement, SDKOptions, Snapshot } from './types.js';

export interface MarkeeSignOptions extends SDKOptions {
  placement: Placement;
  /** Show a button that opens the SDK payment modal. Defaults to true. */
  showAction?: boolean;
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
.sign{position:relative;overflow:hidden;border:1px solid var(--markee-border);border-radius:var(--markee-card-radius);background:var(--markee-surface);padding:22px;min-height:190px}
.eyebrow{color:var(--markee-muted);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.board{margin:5px 0 20px;color:var(--markee-muted);font-size:13px}
.message{font-size:clamp(20px,4vw,30px);line-height:1.3;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 16px}
.author{color:var(--markee-muted);font-size:13px;margin:0 0 16px}
.obscured{filter:blur(8px);user-select:none;pointer-events:none}
.veil{position:absolute;inset:55px 12px 62px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--markee-surface) 75%,transparent);color:var(--markee-muted);font-size:14px;text-align:center;padding:15px}
.notice{color:var(--markee-muted);font-size:14px;min-height:54px}
.action{appearance:none;border:0;border-radius:var(--markee-control-radius);background:var(--markee-primary);color:var(--markee-primary-text);font:inherit;font-weight:700;padding:11px 16px;cursor:pointer}
.action:focus-visible{outline:2px solid var(--markee-focus-ring);outline-offset:3px}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

/** @internal Pure renderer kept separate so hidden-content behavior can be verified. */
export function signHtml(snapshot: Snapshot | null, showAction: boolean, unavailable = false): string {
  const board = snapshot?.name || 'Markee';
  const kind = snapshot ? snapshot.strategy === 'rent' ? 'For rent' : 'For sale' : '';
  const { entry, visibility } = snapshot ? signContent(snapshot) : { entry: null, visibility: 'unavailable' as const };
  const body = unavailable ? '<p class="notice" role="status">Markee sign is temporarily unavailable.</p>'
    : !snapshot ? '<p class="notice" role="status">Loading the Markee sign…</p>'
      : !entry ? '<p class="notice">The sign is waiting for its first message.</p>'
        : visibility === 'unavailable' ? '<p class="notice" role="status">Message unavailable while moderation loads.</p>'
          : `<div class="${visibility === 'flagged' ? 'obscured' : ''}" ${visibility === 'flagged' ? 'aria-hidden="true"' : ''}><p class="message">${escapeHtml(entry.message)}</p><p class="author">${escapeHtml(entry.name || shortAddress(entry.owner))}</p></div>${visibility === 'flagged' ? '<div class="veil" role="status">This message has been flagged.</div>' : ''}`;
  return `<style>${css}</style><section class="sign" aria-label="${escapeHtml(board)} Markee sign"><div class="eyebrow">Current Markee sign</div><p class="board">${escapeHtml(board)}${kind ? ` · ${kind}` : ''}</p>${body}${showAction && snapshot?.board ? '<button class="action" type="button" data-markee-open>Open Markee</button>' : ''}</section>`;
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
  const modal = createMarkee(options);
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
    if ((event.target as HTMLElement).closest('[data-markee-open]')) modal.open({ placement: options.placement });
  });
  render();
  if (options.siteUrl) client.registerSite(options.placement);
  void refresh();
  return {
    refresh,
    setTheme: theme.set,
    destroy() { active = false; request?.abort(); clearTimeout(timer); observer?.disconnect(); modal.close(); theme.destroy(); host.remove(); },
  };
}
