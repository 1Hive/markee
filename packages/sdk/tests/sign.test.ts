import assert from 'node:assert/strict';
import test from 'node:test';
import { signContent, signHtml } from '../src/sign';
import type { Entry, Snapshot } from '../src/types';

const address = '0x1111111111111111111111111111111111111111' as const;
const entry: Entry = { address, owner: address, message: 'Current message', name: 'Author', score: '1', totalFunds: '1', aggregateRate: '0', legacyFloor: '0', moderated: false, views: 0 };
const snapshot = { top: address.toUpperCase(), entries: [entry], name: 'Sample', strategy: 'sale', minimum: '1000000000000000' } as unknown as Snapshot;

test('the sign uses the current winner and follows Markee moderation state', () => {
  assert.deepEqual(signContent(snapshot), { entry, visibility: 'visible' });
  assert.equal(signContent({ ...snapshot, entries: [{ ...entry, moderated: true }] }).visibility, 'flagged');
  assert.equal(signContent({ ...snapshot, entries: [{ ...entry, moderated: null }] }).visibility, 'unavailable');
  assert.equal(signContent({ ...snapshot, top: null }).entry, null);
});

test('unknown moderation withholds message; flagged content is blurred and excluded from view tracking', () => {
  const unknown = signHtml({ ...snapshot, entries: [{ ...entry, moderated: null }] }, true);
  assert.doesNotMatch(unknown, /Current message|Author/);
  assert.match(unknown, /Message unavailable while moderation loads/);
  const flagged = signHtml({ ...snapshot, entries: [{ ...entry, moderated: true }] }, true);
  assert.match(flagged, /class="message obscured" aria-hidden="true"/);
  assert.match(flagged, /This message has been flagged/);
});

test('the sign is one themed button with views and a rental rate; action can be disabled', () => {
  const sale = signHtml(snapshot, true);
  assert.match(sale, /<button class="sign" type="button" data-markee-open/);
  assert.match(sale, /aria-label="0 views"/);
  assert.match(sale, />Current message<\/span>/);
  assert.doesNotMatch(sale, /<button[^>]*>.*<button/s);
  const rent = signHtml({ ...snapshot, strategy: 'rent' }, true);
  assert.match(rent, /class="rate">0\.001 ETH\/mo to change<\/span>/);
  assert.match(signHtml(snapshot, false), /<div class="sign" aria-label="Sample Markee sign"/);
});
