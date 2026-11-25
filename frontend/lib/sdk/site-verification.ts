import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { kv } from '@vercel/kv';
import type { Placement } from '../../../packages/sdk/src/types';
import { SDKError } from './validation';
import { boardContext } from './snapshot';
import { publicIPv4 } from '../net/public-address';

export { publicIPv4 };

export function siteUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new SDKError('INVALID_SITE', 'Provide a public HTTPS site URL.');
  let url: URL;
  try { url = new URL(value.includes('://') ? value : `https://${value}`); } catch { throw new SDKError('INVALID_SITE', 'Invalid site URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || url.hostname.startsWith('[') || !url.hostname.includes('.')) throw new SDKError('INVALID_SITE', 'Provide a public HTTPS hostname using the default port.');
  url.hash = ''; url.search = '';
  return url;
}
// Hosts where anyone can serve HTML they choose under a shared domain: request inspectors, echo and
// mock APIs, and raw-file CDNs. A marker on a page there proves nothing about who runs a site.
const SHARED_CONTENT_HOSTS = [
  'webhook.site', 'webhook.cool', 'typedwebhook.tools', 'requestbin.com', 'requestbin.net', 'pipedream.net',
  'beeceptor.com', 'mockbin.org', 'mockbin.io', 'httpbin.org', 'postb.in', 'hookbin.com', 'requestcatcher.com',
  'ptsv2.com', 'ptsv3.com', 'putsreq.com', 'mocky.io', 'run.mocky.io', 'requestinspector.com', 'webhookinbox.com',
  'oast.pro', 'oast.live', 'oast.site', 'oast.online', 'oast.fun', 'oast.me', 'burpcollaborator.net', 'interact.sh',
  'raw.githack.com', 'rawcdn.githack.com', 'cdpn.io', 'htmlpreview.github.io',
];
export function sharedContentHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return SHARED_CONTENT_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
}
export function hasSiteMarker(html: string, board: string): boolean {
  const visit = (node: DefaultTreeAdapterMap['node']): boolean => {
    if ('tagName' in node && !['script', 'style', 'template'].includes(node.tagName) && node.attrs.some(attr => attr.name === 'data-markee-address' && attr.value.toLowerCase() === board.toLowerCase())) return true;
    return 'childNodes' in node && node.childNodes.some(visit);
  };
  return visit(parse(html));
}
export async function fetchSiteHtml(url: URL): Promise<string> {
  const records = await lookup(url.hostname, { all: true, family: 4 });
  if (!records.length || records.some(r => !publicIPv4(r.address))) throw new SDKError('INVALID_SITE', 'Site must resolve to public IPv4 addresses.');
  // Pin the vetted address for the connection. Never follow redirects or re-resolve DNS.
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', family: 4, headers: { 'User-Agent': 'Markee-Verifier/2.0', Accept: 'text/html', 'Accept-Encoding': 'identity' }, lookup: (_host, options, cb) => {
      const pinned = { address: records[0].address, family: 4 };
      if (typeof options === 'object' && options.all) cb(null, [pinned]);
      else cb(null, pinned.address, pinned.family);
    }, signal: AbortSignal.timeout(10_000) }, res => {
      if (res.statusCode !== 200 || !res.headers['content-type']?.toLowerCase().includes('text/html')) { res.resume(); reject(new SDKError('SITE_UNREACHABLE', 'Use the final public HTML page URL (redirects are not followed).', 422)); return; }
      let size = 0; const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1024 * 1024) res.destroy(new Error('Site HTML exceeds 1 MB')); else chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject); req.end();
  });
}
const MERGE = `local raw=redis.call('GET',KEYS[1]) or (KEYS[2] and redis.call('GET',KEYS[2])); local m=raw and cjson.decode(raw) or {}; local urls=m.verifiedUrls or {}; if m.verifiedUrl and #urls==0 then table.insert(urls,m.verifiedUrl) end; for _,u in ipairs(urls) do if u==ARGV[1] then return cjson.encode(urls) end end; if #urls>=100 then return redis.error_reply('Site limit reached') end; table.insert(urls,ARGV[1]); m.verifiedUrls=urls; m.verifiedUrl=urls[1]; m.status='verified'; redis.call('SET',KEYS[1],cjson.encode(m)); return '+'..cjson.encode(urls)`;
// Who attached a site, for tracing abuse later. Only new attachments log: the SDK re-registers its
// site on every page load.
export interface SiteRequestContext { userAgent?: string | null; country?: string | null }
export async function verifySite(p: Placement, value: unknown, origin: string | null, context: SiteRequestContext = {}) {
  if (p.kind !== 'board' || p.chainId !== 8453) throw new SDKError('UNSUPPORTED_SITE', 'Website verification currently supports Base boards.');
  const url = siteUrl(value);
  if (sharedContentHost(url.hostname)) throw new SDKError('INVALID_SITE', 'Anyone can publish pages on this host, so it cannot be a verified site.');
  // Browsers always send Origin on this cross-origin POST, so the SDK is unaffected. A request without
  // one is a script, and it must not attach a site the board never ran.
  if (!origin || origin !== url.origin) throw new SDKError('SITE_ORIGIN_MISMATCH', 'The site must match the requesting app origin.', 403);
  const { board, legacyBoard } = await boardContext(p.chainId, p.address);
  let html: string;
  try { html = await fetchSiteHtml(url); } catch (e) { if (e instanceof SDKError) throw e; throw new SDKError('SITE_UNREACHABLE', 'Could not read this public site.', 422); }
  if (!hasSiteMarker(html, p.address) && !hasSiteMarker(html, board)) return { verified: false, url: url.href, message: 'Publish a data-markee-address attribute containing this board address in the page HTML, then retry.' };
  const result = await kv.eval(MERGE, [`oi:meta:${board.toLowerCase()}`, ...(legacyBoard ? [`oi:meta:${legacyBoard.toLowerCase()}`] : [])], [url.href]);
  await kv.set('sdk:snapshots:generation', randomUUID());
  await Promise.all(['cache:openinternet:leaderboards', 'cache:forsale:leaderboards', 'cache:streaming:leaderboards', 'cache:ecosystem:leaderboards', ...['openinternet', 'forsale', 'streaming'].map(platform => `sdk:snapshots:v1:listings:cache:${platform}:leaderboards`)].map(key => kv.del(key)));
  // The KV client parses a JSON reply itself; the '+' marking a new attachment keeps it a string.
  const added = typeof result === 'string' && result.startsWith('+');
  const verifiedUrls = (added ? JSON.parse((result as string).slice(1)) : typeof result === 'string' ? JSON.parse(result) : result) as string[];
  if (added) console.info('[sdk:sites/verify] attached', JSON.stringify({ board: board.toLowerCase(), url: url.href, origin, userAgent: context.userAgent?.slice(0, 300) ?? null, country: context.country ?? null }));
  return { verified: true, url: url.href, verifiedUrls };
}
