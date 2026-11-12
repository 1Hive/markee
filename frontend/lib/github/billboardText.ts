const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)
const LINE_BREAKS = new RegExp(`[\\r\\n\\x85${LS}${PS}\\t\\v\\f]+`, 'g')
const CONTROL = /[\x00-\x1f\x7f-\x9f]/g

export function billboardLine(text: string): string {
  return text.replace(LINE_BREAKS, ' ').replace(CONTROL, '').replace(/ {2,}/g, ' ').trim()
}
