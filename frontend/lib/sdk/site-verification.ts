import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { kv } from '@vercel/kv';
import type { Placement } from '../../../packages/sdk/src/types';
import { SDKError } from './validation';
import { boardContext } from './snapshot';

export function siteUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new SDKError('INVALID_SITE', 'Provide a public HTTPS site URL.');
  let url: URL;
  try { url = new URL(value.includes('://') ? value : `https://${value}`); } catch { throw new SDKError('INVALID_SITE', 'Invalid site URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || url.hostname.startsWith('[') || !url.hostname.includes('.')) throw new SDKError('INVALID_SITE', 'Provide a public HTTPS hostname using the default port.');
  url.hash = ''; url.search = '';
  return url;
}
export function publicIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a,b,c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2) || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
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
    const req = request(url, { method: 'GET', headers: { 'User-Agent': 'Markee-Verifier/2.0', Accept: 'text/html', 'Accept-Encoding': 'identity' }, lookup: (_host, _options, cb) => cb(null, records[0].address, 4), signal: AbortSignal.timeout(10_000) }, res => {
      if (res.statusCode !== 200 || !res.headers['content-type']?.toLowerCase().includes('text/html')) { res.resume(); reject(new SDKError('SITE_UNREACHABLE', 'Use the final public HTML page URL (redirects are not followed).', 422)); return; }
      let size = 0; const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1024 * 1024) res.destroy(new Error('Site HTML exceeds 1 MB')); else chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject); req.end();
  });
}
const MERGE = `local raw=redis.call('GET',KEYS[1]); local m=raw and cjson.decode(raw) or {}; local urls=m.verifiedUrls or {}; if m.verifiedUrl and #urls==0 then table.insert(urls,m.verifiedUrl) end; for _,u in ipairs(urls) do if u==ARGV[1] then return cjson.encode(urls) end end; if #urls>=100 then return redis.error_reply('Site limit reached') end; table.insert(urls,ARGV[1]); m.verifiedUrls=urls; m.verifiedUrl=urls[1]; m.status='verified'; redis.call('SET',KEYS[1],cjson.encode(m)); return cjson.encode(urls)`;
export async function verifySite(p: Placement, value: unknown, origin: string | null) {
  if (p.kind !== 'board' || p.chainId !== 8453) throw new SDKError('UNSUPPORTED_SITE', 'Website verification currently supports Base boards.');
  const url = siteUrl(value);
  if (origin && origin !== url.origin) throw new SDKError('SITE_ORIGIN_MISMATCH', 'The site must match the requesting app origin.', 403);
  await boardContext(p.chainId, p.address);
  let html: string;
  try { html = await fetchSiteHtml(url); } catch (e) { if (e instanceof SDKError) throw e; throw new SDKError('SITE_UNREACHABLE', 'Could not read this public site.', 422); }
  if (!hasSiteMarker(html, p.address)) return { verified: false, url: url.href, message: 'Publish a data-markee-address attribute containing this board address in the page HTML, then retry.' };
  const result = await kv.eval(MERGE, [`oi:meta:${p.address.toLowerCase()}`], [url.href]);
  await kv.set('sdk:snapshots:generation', randomUUID());
  await Promise.all(['cache:openinternet:leaderboards', 'cache:ecosystem:leaderboards'].map(key => kv.del(key)));
  return { verified: true, url: url.href, verifiedUrls: (typeof result === 'string' ? JSON.parse(result) : result) as string[] };
}
