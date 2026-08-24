import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/sellerDraftRetention.ts', import.meta.url), 'utf8');
assert.match(source, /SELLER_DRAFT_RETENTION_DAYS\s*=\s*30/);

const route = await readFile(new URL('../app/api/cron/cleanup-seller-drafts/route.ts', import.meta.url), 'utf8');
assert.match(route, /status:\s*'draft'/);
assert.match(route, /status:\s*'abandoned'/);
assert.match(route, /deleted:\s*0/);
assert.doesNotMatch(route, /\.delete|\.remove|storage/);
assert.doesNotMatch(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'), /cleanup-seller-drafts/);

console.log('seller draft retention policy checks passed');
