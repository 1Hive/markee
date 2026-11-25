import assert from 'node:assert/strict';
import test from 'node:test';
import { siteUrl, publicIPv4, hasSiteMarker, sharedContentHost, verifySite } from '../lib/sdk/site-verification';
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
test('hosts where anyone can publish HTML are never verified sites', async () => {
  for (const host of ['webhook.site', 'WEBHOOK.SITE.', 'eo1x.m.pipedream.net', 'x.free.beeceptor.com', 'raw.githack.com', 'abc.oast.fun']) assert.equal(sharedContentHost(host), true, host);
  for (const host of ['frogandgoose.space', 'notwebhook.site', 'gardens.fund', 'markee.xyz', 'user.github.io']) assert.equal(sharedContentHost(host), false, host);
  const url = 'https://webhook.site/d21b2946-3aab-4141-af95-b979b31d0c15';
  await assert.rejects(verifySite({ kind: 'board', chainId: 8453, address: board }, url, 'https://webhook.site'), { code: 'INVALID_SITE' });
});
test('site verification needs the requesting origin to match the site', async () => {
  const p = { kind: 'board', chainId: 8453, address: board } as const;
  await assert.rejects(verifySite(p, 'https://example.com', null), { code: 'SITE_ORIGIN_MISMATCH', status: 403 });
  await assert.rejects(verifySite(p, 'https://example.com', 'https://other.example'), { code: 'SITE_ORIGIN_MISMATCH', status: 403 });
});
