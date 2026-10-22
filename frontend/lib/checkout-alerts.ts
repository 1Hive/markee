/** Only bounded operational metadata may leave the checkout for diagnostics. */
export const checkoutStages = ['loading', 'balance', 'funding', 'conversion', 'payment', 'verification'] as const;
export type CheckoutStage = typeof checkoutStages[number];
const codes = new Set(['REQUEST_FAILED', 'RATE_LIMITED', 'CONVERSION_UNAVAILABLE', 'CONVERSION_FAILED', 'TRANSACTION_MISMATCH', 'TRANSACTION_REUSED', 'INSUFFICIENT_USDC', 'QUOTE_EXPIRED']);
export function checkoutAlert(input: Record<string, unknown>) {
  if (!checkoutStages.includes(input.stage as CheckoutStage)) return null;
  return {
    stage: input.stage as CheckoutStage,
    provider: input.provider === 'stripe' || input.provider === 'moonpay' ? input.provider : 'unknown',
    code: typeof input.code === 'string' && codes.has(input.code) ? input.code : 'UNEXPECTED_ERROR',
  };
}
export function discordEnvironment(environment: string | undefined) {
  return environment === 'production' ? 'production' : environment === 'preview' ? 'staging' : null;
}
