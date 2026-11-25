#!/usr/bin/env node
// Run from frontend with the normal server-side KV environment. Observations
// are self-reported and expire after 90 days; no wallet or page path is stored.
import { kv } from '@vercel/kv';

const boards = process.argv.slice(2);
if (!boards.length || boards.some(board => !/^0x[0-9a-f]{40}$/i.test(board))) {
  console.error('Usage: node scripts/report-sdk-clients.mjs <Base board address> [more addresses...]');
  process.exit(2);
}
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('Set the Markee server-side KV environment before reading observations.');
  process.exit(2);
}
for (const board of boards) {
  const fields = await kv.hgetall(`sdk:client-observations:v1:8453:${board.toLowerCase()}`) || {};
  const observations = Object.entries(fields)
    .map(([field, timestamp]) => {
      const separator = field.lastIndexOf('|');
      return { client: field.slice(0, separator), originHost: field.slice(separator + 1), lastSeen: new Date(Number(timestamp)).toISOString() };
    })
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  console.log(JSON.stringify({ board, observations }));
}
