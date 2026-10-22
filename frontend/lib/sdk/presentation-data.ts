import { kv } from '@vercel/kv';
import { SDKError } from './validation';

type Metadata = { siteUrl?: string; logoUrl?: string; verifiedUrl?: string; verifiedUrls?: string[] };
const publicApi = 'https://www.markee.xyz/api';

// Local SDK worktrees can use Markee's existing public data API without copying
// database credentials. Production always uses its own configured database.
export function publicDataProxyEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.MARKEE_SDK_PUBLIC_DATA_PROXY === 'true';
}

async function publicJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${publicApi}${path}`, {
    ...init, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new SDKError('DATA_UNAVAILABLE', 'Markee data is temporarily unavailable.', 502);
  return response.json();
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function readPresentationData(board: string, addresses: string[]): Promise<{
  flags: string[]; views: (number | null)[]; metadata: Metadata | null;
}> {
  if (!publicDataProxyEnabled()) {
    const [flags, views, metadata] = await Promise.all([
      kv.smembers<string[]>('moderation:flagged'),
      addresses.length ? kv.mget<(number | null)[]>(...addresses.map(a => `views:total:${a.toLowerCase()}`)) : [],
      kv.get<Metadata>(`oi:meta:${board.toLowerCase()}`),
    ]);
    return { flags, views, metadata };
  }

  const [moderation, views, metadata] = await Promise.all([
    publicJson('/moderation'),
    addresses.length ? publicJson(`/views?${new URLSearchParams({ addresses: addresses.map(a => a.toLowerCase()).join(',') })}`) : {},
    publicJson(`/openinternet/meta?${new URLSearchParams({ address: board.toLowerCase() })}`),
  ]);
  if (!object(moderation) || !Array.isArray(moderation.flagged) ||
    !moderation.flagged.every(flag => typeof flag === 'string' && /^\d+:0x[\da-f]{40}$/i.test(flag)) ||
    !object(views) || !object(metadata) ||
    ['siteUrl', 'logoUrl', 'verifiedUrl'].some(key => metadata[key] != null && typeof metadata[key] !== 'string') ||
    (metadata.verifiedUrls != null && (!Array.isArray(metadata.verifiedUrls) || !metadata.verifiedUrls.every(url => typeof url === 'string')))) {
    throw new SDKError('DATA_UNAVAILABLE', 'Markee returned invalid presentation data.', 502);
  }
  const counts = addresses.map(address => {
    const entry = views[address.toLowerCase()];
    if (!object(entry) || !count(entry.totalViews)) throw new SDKError('DATA_UNAVAILABLE', 'Markee returned invalid view counts.', 502);
    return entry.totalViews;
  });
  return { flags: moderation.flagged, views: counts, metadata: metadata as Metadata };
}

export async function recordPublicView(body: { address: string; message: string; url?: string }) {
  const result = await publicJson('/views', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!object(result) || !count(result.totalViews) || !count(result.messageViews) || typeof result.counted !== 'boolean') {
    throw new SDKError('DATA_UNAVAILABLE', 'Markee returned invalid view counts.', 502);
  }
  return result;
}
