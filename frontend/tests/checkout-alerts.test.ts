import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutAlert, discordEnvironment } from '../lib/checkout-alerts';

test('preview alerts are tagged staging; local builds never send Discord alerts', () => {
  assert.equal(discordEnvironment('preview'), 'staging');
  assert.equal(discordEnvironment('production'), 'production');
  assert.equal(discordEnvironment('development'), null);
  assert.equal(discordEnvironment(undefined), null);
});
test('checkout diagnostics strip credentials, card data, URLs, wallet addresses and unknown provider errors', () => {
  const report = checkoutAlert({ stage: 'funding', provider: 'stripe', code: 'secret-provider-payload', token: 'secret', message: 'card details', stack: 'secret stack', wallet: '0x123', url: 'https://example.com/#token=secret' });
  assert.deepEqual(report, { stage: 'funding', provider: 'stripe', code: 'UNEXPECTED_ERROR' });
  assert.equal(checkoutAlert({ stage: 'unknown' }), null);
  assert.deepEqual(checkoutAlert({ stage: 'conversion', provider: 'arbitrary', code: 'TRANSACTION_MISMATCH' }), { stage: 'conversion', provider: 'unknown', code: 'TRANSACTION_MISMATCH' });
});
