/** No floating point conversion when preparing financial amounts. */
export function parseEth(input: string, allowZero = false): string {
  const value = input.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(value)) throw new Error('Enter an ETH amount with up to 18 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if ((!allowZero && amount === 0n) || amount >= 2n ** 256n) throw new Error('Enter a positive amount.');
  return amount.toString();
}
export function formatEth(raw: string, decimals = 6): string {
  const value = BigInt(raw), sign = value < 0n ? '-' : '', n = value < 0n ? -value : value;
  const fraction = (n % 10n ** 18n).toString().padStart(18, '0').slice(0, decimals).replace(/0+$/, '');
  if (n > 0n && n < 10n ** BigInt(18 - decimals)) return `${sign}<0.${'0'.repeat(decimals - 1)}1`;
  return `${sign}${n / 10n ** 18n}${fraction ? `.${fraction}` : ''}`;
}
export function shortAddress(value: string): string { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
export function escapeHtml(value: unknown): string { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
