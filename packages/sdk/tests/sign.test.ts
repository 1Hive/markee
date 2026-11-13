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
  assert.match(unknown, /class="skeleton-lines" role="status" aria-label="Loading message"><span class="skeleton-line"><\/span><span class="skeleton-line short"><\/span>/);
  assert.doesNotMatch(unknown, /This is a sign/);
  assert.doesNotMatch(unknown, new RegExp(entry.message));
  // Before the snapshot arrives the sign shows the same bars, so nothing jumps once it loads.
  assert.match(signHtml(null, true), /class="skeleton-lines" role="status" aria-label="Loading the Markee sign"/);
  const flagged = signHtml({ ...snapshot, entries: [{ ...entry, moderated: true }] }, true);
  assert.match(flagged, /class="message obscured" aria-hidden="true"/);
  assert.match(flagged, /This message has been flagged/);
});

test('the sign shows the change amount for sale and monthly rate for rent; action can be disabled', () => {
  const sale = signHtml(snapshot, true);
  assert.match(sale, /<button class="sign has-rate" type="button" data-markee-open/);
  const fundedSale = signHtml({ ...snapshot, entries: [{ ...entry, score: '500000000000000000', totalFunds: '500000000000000000' }] }, true);
  assert.match(fundedSale, /class="rate">0\.501 ETH to change<\/span>/);
  assert.doesNotMatch(fundedSale, /ETH\/mo to change/);
  assert.match(sale, /aria-label="0 views"/);
  assert.match(sale, />Current message<\/span>/);
  assert.match(sale, /class="logo-dark" src="data:image\/png;base64,/);
  assert.match(sale, /class="logo-light" src="data:image\/png;base64,/);
  assert.doesNotMatch(sale, /<button[^>]*>.*<button/s);
  const rent = signHtml({ ...snapshot, strategy: 'rent' }, true);
  assert.match(rent, /class="rate">0\.001 ETH\/mo to change<\/span>/);
  assert.match(signHtml(snapshot, false), /<div class="sign" aria-label="Sample Markee sign"/);
  assert.doesNotMatch(signHtml(snapshot, false), /class="watermark"/);
  assert.doesNotMatch(signHtml(snapshot, false), /class="rate"/);
});
