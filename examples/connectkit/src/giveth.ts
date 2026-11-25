const MARKEE_API = 'https://www.markee.xyz/api/sdk/v1';

export function givethProjectIdentifier(input: string): { kind: 'id' | 'slug'; value: string } | null {
  let value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!['giveth.io', 'www.giveth.io'].includes(url.hostname.toLowerCase())) return null;
      const match = url.pathname.match(/^\/project\/(.+?)\/?$/i);
      if (!match) return null;
      value = decodeURIComponent(match[1]);
    } catch { return null; }
  }
  if (/^\d+$/.test(value) && value.length <= 200) {
    const id = BigInt(value);
    return id > 0n && id <= BigInt(Number.MAX_SAFE_INTEGER) ? { kind: 'id', value: id.toString() } : null;
  }
  return value.length <= 200 && !/[\s/?#]/.test(value) ? { kind: 'slug', value } : null;
}

export async function resolveGivethProjectSlug(slug: string, signal: AbortSignal, apiUrl = MARKEE_API): Promise<{ id: string; title: string }> {
  const url = new URL(`${apiUrl.replace(/\/$/, '')}/platform/giveth/resolve`);
  url.searchParams.set('slug', slug);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Giveth lookup is unavailable.');
  const project = await response.json() as { id?: string | number; title?: string };
  const id = String(project.id ?? '');
  if (!/^\d+$/.test(id) || BigInt(id) === 0n || BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Giveth returned an invalid Project ID.');
  return { id: BigInt(id).toString(), title: project.title || '' };
}
