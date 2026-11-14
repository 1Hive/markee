import { isIP } from 'node:net'

const NON_PUBLIC_IPV4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
]

function ipv4Number(ip: string): number {
  return ip.split('.').reduce((n, octet) => n * 256 + Number(octet), 0)
}

function inIPv4Range(ip: number, [base, bits]: readonly [string, number]): boolean {
  const size = 2 ** (32 - bits)
  return Math.floor(ip / size) === Math.floor(ipv4Number(base) / size)
}

export function publicIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false
  const n = ipv4Number(ip)
  return !NON_PUBLIC_IPV4.some(range => inIPv4Range(n, range))
}

function ipv6Hextets(ip: string): number[] | null {
  if (isIP(ip) !== 6 || ip.includes('%')) return null
  let text = ip.toLowerCase()
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number)
    text = text.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, tail] = text.split('::')
  const left = head ? head.split(':') : []
  const right = tail === undefined ? [] : tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  const parts = tail === undefined ? left : [...left, ...Array(missing).fill('0'), ...right]
  if (parts.length !== 8) return null
  return parts.map(p => parseInt(p, 16))
}

function embeddedIPv4(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

export function publicIPv6(ip: string): boolean {
  const h = ipv6Hextets(ip)
  if (!h) return false
  const zeroPrefix = h.slice(0, 5).every(x => x === 0)
  if (zeroPrefix && h[5] === 0xffff) return publicIPv4(embeddedIPv4(h[6], h[7]))
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) return publicIPv4(embeddedIPv4(h[6], h[7]))
  if ((h[0] & 0xe000) !== 0x2000) return false
  if (h[0] === 0x2001 && h[1] < 0x200) return false
  if (h[0] === 0x2001 && h[1] === 0xdb8) return false
  if (h[0] === 0x2002) return publicIPv4(embeddedIPv4(h[1], h[2]))
  if (h[0] === 0x3fff && h[1] < 0x1000) return false
  return true
}

export function publicIP(ip: string): boolean {
  const version = isIP(ip)
  return version === 4 ? publicIPv4(ip) : version === 6 ? publicIPv6(ip) : false
}
