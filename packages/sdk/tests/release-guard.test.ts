import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('stable publication rejects staging while prerelease overrides remain possible', async t => {
  const root = await mkdtemp(join(tmpdir(), 'markee-release-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([mkdir(join(root, 'scripts')), mkdir(join(root, 'dist'))]);
  await writeFile(join(root, 'scripts/check-release.mjs'), await readFile(new URL('../scripts/check-release.mjs', import.meta.url)));
  const check = () => execFileSync(process.execPath, [join(root, 'scripts/check-release.mjs')], { stdio: 'pipe' });
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', version: '1.0.0' }));
  await writeFile(join(root, 'dist/index.js'), 'export const DEFAULT_MARKEE_API_URL = "https://staging.markee.xyz/api/sdk/v1";');
  assert.throws(check, /Stable SDK releases must use the production Markee API/);
  await writeFile(join(root, 'dist/index.js'), 'export const DEFAULT_MARKEE_API_URL = "https://www.markee.xyz/api/sdk/v1";');
  assert.doesNotThrow(check);
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', version: '0.1.0-beta.2' }));
  await writeFile(join(root, 'dist/index.js'), 'export const DEFAULT_MARKEE_API_URL = "http://localhost:3000/api/sdk/v1";');
  assert.doesNotThrow(check);
});
