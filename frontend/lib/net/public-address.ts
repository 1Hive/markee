import { isIP } from 'node:net'

export function publicIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false
  const [a, b, c] = ip.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
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
