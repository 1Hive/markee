import assert from 'node:assert/strict';
import test from 'node:test';
import { siteUrl, publicIPv4, hasSiteMarker } from '../lib/sdk/site-verification';
const board = '0x1111111111111111111111111111111111111111';
test('site URL normalization rejects credentials, private literals and alternate protocols/ports', () => {
  assert.equal(siteUrl('example.com/path?token=secret#fragment').href, 'https://example.com/path');
  for (const url of ['http://example.com', 'https://user:password@example.com', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://example.com:8443']) assert.throws(() => siteUrl(url));
});
test('verifier address policy excludes private and reserved ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.0.1', '198.18.0.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('8.8.8.8'), true);
});
test('only the matching markup verifies, not script strings or comments', () => {
  const marker = `<span hidden data-markee-address="${board}"></span>`;
  assert.equal(hasSiteMarker(marker, board), true);
  assert.equal(hasSiteMarker(`<div title='data-markee-address="${board}"'></div>`, board), false);
  assert.equal(hasSiteMarker(`<template>${marker}</template>`, board), false);
  assert.equal(hasSiteMarker(`<script>${JSON.stringify(marker)}</script>`, board), false);
  assert.equal(hasSiteMarker(`<!--${marker}-->`, board), false);
  assert.equal(hasSiteMarker(marker, '0x2222222222222222222222222222222222222222'), false);
});
