import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { publicIP } from './public-address'

export type PublicFetchErrorCode = 'INVALID_URL' | 'PRIVATE_ADDRESS' | 'TOO_MANY_REDIRECTS' | 'TOO_LARGE' | 'TIMEOUT' | 'NETWORK'

export class PublicFetchError extends Error {
  constructor(readonly code: PublicFetchErrorCode, message: string) {
    super(message)
    this.name = 'PublicFetchError'
  }
}

export interface PublicResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
  url: URL
}

export interface PinnedRequest {
  url: URL
  address: string
  family: 4 | 6
  headers: Record<string, string>
  maxBytes: number
  signal: AbortSignal
}

export interface PublicFetchOptions {
  protocols?: readonly ('http:' | 'https:')[]
  maxRedirects?: number
  maxBytes?: number
  timeoutMs?: number
  headers?: Record<string, string>
}

function sendPinned({ url, address, family, headers, maxBytes, signal }: PinnedRequest): Promise<Omit<PublicResponse, 'url'>> {
  const send = url.protocol === 'http:' ? httpRequest : httpsRequest
  return new Promise((resolve, reject) => {
    const req = send(url, {
      method: 'GET',
      headers: { 'Accept-Encoding': 'identity', ...headers },
      signal,
      lookup: (_host, options, cb) => {
        if (typeof options === 'object' && options.all) cb(null, [{ address, family }])
        else cb(null, address, family)
      },
    }, res => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) {
        res.resume()
        resolve({ status, headers: res.headers, body: Buffer.alloc(0) })
        return
      }
      if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
        res.destroy()
        reject(new PublicFetchError('TOO_LARGE', 'Response is too large.'))
        return
      }
      let size = 0
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) res.destroy(new PublicFetchError('TOO_LARGE', 'Response is too large.'))
        else chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

export const publicFetchDeps = {
  lookup: (hostname: string) => lookup(hostname, { all: true, verbatim: true }),
  send: sendPinned,
}

function hostOf(url: URL): string {
  return url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
}

async function publicAddresses(hostname: string): Promise<{ address: string; family: 4 | 6 }[]> {
  if (isIP(hostname)) {
    if (!publicIP(hostname)) throw new PublicFetchError('PRIVATE_ADDRESS', 'Host is not a public address.')
    return [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
  }
  let records: { address: string; family: number }[]
  try {
    records = await publicFetchDeps.lookup(hostname)
  } catch {
    throw new PublicFetchError('NETWORK', 'Host could not be resolved.')
  }
  if (!records.length || records.some(r => !publicIP(r.address))) {
    throw new PublicFetchError('PRIVATE_ADDRESS', 'Host must resolve only to public addresses.')
  }
  return records.map(r => ({ address: r.address, family: r.family === 6 ? 6 : 4 }))
}

function checkedUrl(value: string | URL, protocols: readonly string[]): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new PublicFetchError('INVALID_URL', 'Invalid URL.') }
  if (!protocols.includes(url.protocol)) throw new PublicFetchError('INVALID_URL', 'Only HTTP and HTTPS URLs are allowed.')
  if (url.username || url.password) throw new PublicFetchError('INVALID_URL', 'URLs with credentials are not allowed.')
  return url
}

// Every hop is resolved, checked and connected to the vetted address, so neither a redirect nor a
// second DNS answer can move the request onto a private network.
export async function fetchPublic(input: string | URL, options: PublicFetchOptions = {}): Promise<PublicResponse> {
  const protocols = options.protocols ?? ['https:']
  const maxRedirects = options.maxRedirects ?? 3
  const maxBytes = options.maxBytes ?? 256 * 1024
  const signal = AbortSignal.timeout(options.timeoutMs ?? 8_000)
  let url = checkedUrl(input, protocols)

  for (let hop = 0; ; hop++) {
    const addresses = await publicAddresses(hostOf(url))
    let res: Omit<PublicResponse, 'url'> | undefined
    for (const { address, family } of addresses) {
      try {
        res = await publicFetchDeps.send({ url, address, family, headers: options.headers ?? {}, maxBytes, signal })
        break
      } catch (error) {
        if (error instanceof PublicFetchError) throw error
        if (signal.aborted) throw new PublicFetchError('TIMEOUT', 'Request timed out.')
      }
    }
    if (!res) throw new PublicFetchError('NETWORK', 'Request failed.')
    const location = res.headers.location
    if (res.status < 300 || res.status >= 400 || !location) return { ...res, url }
    if (hop >= maxRedirects) throw new PublicFetchError('TOO_MANY_REDIRECTS', 'Too many redirects.')
    url = checkedUrl(new URL(location, url), protocols)
  }
}
