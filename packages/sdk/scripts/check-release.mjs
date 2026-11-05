import { readFile } from 'node:fs/promises';
import { DEFAULT_MARKEE_API_URL } from '../dist/index.js';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!version.includes('-') && DEFAULT_MARKEE_API_URL !== 'https://www.markee.xyz/api/sdk/v1') {
  throw new Error('Stable SDK releases must use the production Markee API.');
}
