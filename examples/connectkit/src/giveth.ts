const GIVETH_GRAPHQL_URL = 'https://mainnet.serve.giveth.io/graphql';

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
    return id > 0n ? { kind: 'id', value: id.toString() } : null;
  }
  return value.length <= 200 && !/[\s/?#]/.test(value) ? { kind: 'slug', value } : null;
}

export async function resolveGivethProjectSlug(slug: string, signal: AbortSignal): Promise<{ id: string; title: string }> {
  const response = await fetch(GIVETH_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query ResolveProject($slug: String!) { projectBySlug(slug: $slug) { id title } }',
      variables: { slug },
    }),
    signal,
  });
  if (!response.ok) throw new Error('Giveth lookup is unavailable.');
  const result = await response.json() as { data?: { projectBySlug?: { id?: string | number; title?: string } | null }; errors?: unknown[] };
  const project = result.data?.projectBySlug;
  if (result.errors?.length || !project) throw new Error('No Giveth project found for this slug.');
  const id = String(project.id ?? '');
  if (!/^\d+$/.test(id) || BigInt(id) === 0n) throw new Error('Giveth returned an invalid Project ID.');
  return { id: BigInt(id).toString(), title: project.title || '' };
}
