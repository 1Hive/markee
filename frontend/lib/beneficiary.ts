const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ZERO = /^0x0{40}$/

export function beneficiaryError(value: string | undefined | null): string | null {
  const address = (value ?? '').trim()
  if (!ADDRESS.test(address)) return 'Enter a valid 0x wallet address.'
  if (ZERO.test(address)) return 'The zero address cannot receive payments. Enter a wallet you control.'
  return null
}

export function isPayableBeneficiary(value: string | undefined | null): boolean {
  return beneficiaryError(value) === null
}

export function isZeroAddress(value: string | undefined | null): boolean {
  return ZERO.test((value ?? '').trim())
}
