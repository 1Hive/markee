const encoder = new TextEncoder()

export const DEFAULT_MAX_MESSAGE_BYTES = 222
export const DEFAULT_MAX_NAME_BYTES = 22

export function utf8Length(text: string): number {
  return encoder.encode(text).length
}

function codePointBytes(codePoint: number): number {
  return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4
}

export function truncateUtf8(text: string, maxBytes: number): string {
  let bytes = 0
  let end = 0
  for (const char of text) {
    const size = codePointBytes(char.codePointAt(0)!)
    if (bytes + size > maxBytes) break
    bytes += size
    end += char.length
  }
  return end === text.length ? text : text.slice(0, end)
}

export function textLimitError(label: 'Message' | 'Name', text: string, maxBytes: number): string | null {
  return utf8Length(text) > maxBytes ? `${label} must be ${maxBytes} bytes or less. Emoji and non-Latin characters use 2 to 4 bytes each.` : null
}
