import assert from 'node:assert/strict';
import test from 'node:test';
import { errorMessage } from '../src/errors';

test('plain and nested wallet rejections have a readable cancellation message', () => {
  for (const error of [
    { code: 4001, message: 'User rejected the request.' },
    { code: '4001' },
    { code: 'ACTION_REJECTED' },
    { message: 'An RPC error occurred', cause: { code: 4001 } },
    { data: { originalError: { code: 4001 } } },
    new Error('User rejected the request.'),
  ]) assert.match(errorMessage(error), /^Wallet request cancelled\./);
});

test('provider messages remain readable and unknown/cyclic objects never become object Object', () => {
  assert.equal(errorMessage({ message: 'Insufficient funds' }), 'Insufficient funds');
  assert.equal(errorMessage({ shortMessage: 'Network unavailable', message: 'Long provider details' }), 'Network unavailable');
  assert.equal(errorMessage(new Error('Review expired')), 'Review expired');
  const cyclic: { cause?: unknown } = {}; cyclic.cause = cyclic;
  for (const error of [{}, null, undefined, cyclic]) assert.equal(errorMessage(error), 'This request could not be completed. Please try again.');
});
