#!/usr/bin/env node

// The public catalogue is cached (lib/publicCatalog.ts). This test is what
// keeps that cache honest:
//
// - Every in-app write to Listing, Essay or Seller is accounted for. A file
//   either expires the catalogue with revalidatePublicCatalog() after its
//   write, or is listed below with the reason its writes cannot change a card.
//   A new write path that does neither fails here, and so does a stale entry.
// - Every script that writes those models is listed too. Scripts run outside
//   Next and cannot expire the tag; the fingerprint key covers them.
// - The query selects exactly the columns the catalogue uses, the fingerprint
//   mirrors the query's row set, and the cache keeps its tag, backstop and
//   deployment key.
//
// Pure node: reads source files only. No server, no browser, no database.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function walk(dir, keep) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, keep));
    else if (keep(rel)) out.push(rel);
  }
  return out;
}

// Comments are stripped first so a write quoted in a comment does not count.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const MODELS = '(?:listing|essay|seller)';
const OPS = '(?:create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)';
// prisma.listing.update(...), tx.essay.updateMany(...), and the same split over
// lines (prisma.listing\n  .update(...)).
const DIRECT = new RegExp(`\\b(?:prisma|tx)\\s*\\.\\s*${MODELS}\\s*\\.\\s*${OPS}\\s*\\(`, 'g');
// Nested relation writes: essays: { create: [...] }, listings: { update: ... }.
const NESTED = /\b(?:listing|listings|essay|essays|seller|finalizedListing|sourceListing)\s*:\s*\{\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany|set|connectOrCreate)\b/g;
const RAW_WRITE = /\$executeRaw(?:Unsafe)?\b/g;

function writesIn(file) {
  const source = stripComments(read(file));
  const hits = [];
  for (const re of [DIRECT, NESTED, RAW_WRITE]) {
    for (const match of source.matchAll(re)) hits.push({ index: match.index, text: match[0].replace(/\s+/g, '') });
  }
  // Raw SQL that writes through $queryRaw.
  for (const match of source.matchAll(/\$queryRaw(?:Unsafe)?\s*[`(<]/g)) {
    const sql = source.slice(match.index, match.index + 800);
    const end = sql.indexOf('`', sql.indexOf('`') + 1);
    if (/\b(?:UPDATE|INSERT|DELETE|TRUNCATE)\b/i.test(sql.slice(0, end > 0 ? end : 800))) {
      hits.push({ index: match.index, text: '$queryRaw write' });
    }
  }
  return { source, hits: hits.sort((a, b) => a.index - b.index) };
}

// ---- In-app write paths -------------------------------------------------

// Writes that can change a card. Each expires the catalogue after its write.
// `writes` pins how many write calls the file has, so a new one in a listed
// file is reviewed rather than inheriting the file's reason.
const REVALIDATES = {
  'lib/listingDecision.ts': { writes: 1, reason: 'approve or reject: status, reviewedAt (card order), humanReviewedAt (verified ticks), plus the opening line written on approval' },
  'app/api/seller/listing-status/route.ts': { writes: 1, reason: 'seller takedown: approved to removed' },
  'app/api/seller/listing-price/route.ts': { writes: 2, reason: 'seller price change: packagePrice (and Essay.price, which no card shows)' },
  'app/api/admin/listing-school/route.ts': { writes: 1, reason: 'admin confirms the listing college: targetSchool' },
  'app/api/seller/profile/route.ts': { writes: 1, reason: 'seller name and background tags' },
};

// Writes that cannot change a card, with the reason.
const NO_CARD_EFFECT = {
  'app/api/submit-listing/route.ts': { writes: 2, reason: 'creates a pending listing; the catalogue shows approved listings only, and approval revalidates' },
  'app/api/seller/drafts/[id]/finalize/route.ts': { writes: 2, reason: 'creates a pending listing and its essays; approval revalidates' },
  'app/api/upload-essay/route.ts': { writes: 1, reason: 'sets pdfPath and contentHash on essays of a pending listing; neither is in the catalogue' },
  'lib/admitProofUpload.ts': { writes: 1, reason: 'clears review fields on pending listings only' },
  'lib/reviewRunner.ts': { writes: 4, reason: 'claims and annotates pending listings only (status pending in every where); admin approval sets humanReviewedAt, so a late aiDecision cannot change the ticks. Its unreachable auto-approve path goes through applyListingDecision, which revalidates' },
  'lib/openingLine.ts': { writes: 1, reason: 'its two callers are the approval path, which revalidates after it, and the review of a pending listing, which is not in the catalogue. It often runs inside waitUntil, where a queued tag would never be applied' },
  'app/api/seller/applications/route.ts': { writes: 1, reason: 'gradYear, which the catalogue does not read' },
  'app/api/admin/save-for-later/route.ts': { writes: 1, reason: 'savedAt, an admin shelf marker the catalogue does not read' },
  'app/api/seller/signup/route.ts': { writes: 1, reason: 'creates a seller, who has no listings yet' },
  'app/api/seller-login/route.ts': { writes: 2, reason: 'failedLogins and lockedUntil' },
  'app/api/reset-password/route.ts': { writes: 1, reason: 'passwordHash and the lockout counters' },
  'app/api/seller/connect/start/route.ts': { writes: 1, reason: 'Stripe Connect account columns' },
  'lib/sellerPayouts.ts': { writes: 1, reason: 'Stripe payout readiness columns' },
};

const appFiles = [
  ...walk('app', (f) => /\.(ts|tsx)$/.test(f)),
  ...walk('lib', (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)),
  ...walk('components', (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)),
];
const writers = new Map();
for (const file of appFiles) {
  const found = writesIn(file);
  if (found.hits.length) writers.set(file, found);
}

for (const [file, { source, hits }] of writers) {
  const listed = (file in REVALIDATES) + (file in NO_CARD_EFFECT);
  assert.equal(
    listed,
    1,
    `${file} writes ${hits.map((h) => h.text).join(', ')} to a model the public catalogue reads. ` +
      'Call revalidatePublicCatalog() after the write commits and add it to REVALIDATES, ' +
      'or add it to NO_CARD_EFFECT with the reason no catalogue card can change.',
  );
  const entry = REVALIDATES[file] || NO_CARD_EFFECT[file];
  assert.equal(
    hits.length,
    entry.writes,
    `${file} now has ${hits.length} writes to Listing, Essay or Seller, not ${entry.writes}. ` +
      'Check whether the new one can change a catalogue card, then update the count and the reason.',
  );
  if (file in REVALIDATES) {
    const calls = [...source.matchAll(/\brevalidatePublicCatalog\(\)/g)].map((m) => m.index);
    assert.ok(calls.length > 0, `${file} must call revalidatePublicCatalog()`);
    for (const hit of hits) {
      // In a route, each write must be followed by the expiry before the
      // success response that ends its branch.
      const done = file.startsWith('app/') ? source.indexOf('ok: true', hit.index) : source.length;
      assert.ok(
        calls.some((call) => call > hit.index && call < (done === -1 ? source.length : done)),
        `${file}: ${hit.text} must be followed by revalidatePublicCatalog() before it responds`,
      );
    }
    assert.match(source, /from '@\/lib\/publicCatalogCache'/, `${file} must import the helper from lib/publicCatalogCache`);
  }
}
for (const file of [...Object.keys(REVALIDATES), ...Object.keys(NO_CARD_EFFECT)]) {
  assert.ok(writers.has(file), `${file} is listed but no longer writes Listing, Essay or Seller; remove it from the list`);
}

// Approval: one expiry, after the transaction and after the opening line, and
// never inside the transaction callback where it would run before commit.
{
  const source = stripComments(read('lib/listingDecision.ts'));
  const call = source.indexOf('revalidatePublicCatalog()');
  assert.ok(call > source.indexOf('ensureListingOpeningLine(id)'), 'approval must expire the catalogue after writing the opening line');
  assert.ok(call > source.indexOf('return updated;'), 'approval must expire the catalogue after the transaction, not inside it');
  assert.equal(source.split('revalidatePublicCatalog()').length - 1, 1, 'approval expires the catalogue exactly once');
}

// The helper is server-side only and never thrown into a write route.
{
  const helper = read('lib/publicCatalogCache.ts');
  assert.match(helper, /^import 'server-only';/m);
  assert.match(helper, /try \{\s*revalidateTag\(PUBLIC_CATALOG_TAG, \{ expire: 0 \}\);\s*\} catch/, 'revalidation is immediate and can never throw');
  for (const file of appFiles) {
    const source = read(file);
    if (/\brevalidatePublicCatalog\(\)/.test(source)) {
      assert.doesNotMatch(source, /^'use client'/m, `${file} is a client module and cannot revalidate`);
    }
  }
}

// ---- Scripts ------------------------------------------------------------

// Hand-run maintenance scripts that write catalogue models. They run outside
// Next, so they cannot expire the tag. The fingerprint in the cache key picks
// their writes up on the next request. A new one must be added here
// knowingly.
const SCRIPT_WRITERS = new Set([
  'scripts/backfill-essay-content-hashes.mjs',
  'scripts/backfill-listing-target-schools.mjs',
  'scripts/delete-seller.mjs',
  'scripts/extract-opening-lines.mjs',
  'scripts/infer-legacy-target-schools.mjs',
  'scripts/live-purchase-test.mjs',
  'scripts/reprice-approved-listings.mjs',
]);
const scriptFiles = walk('scripts', (f) => /\.m?js$/.test(f) && !/\.test\./.test(f));
const scriptWriters = scriptFiles.filter((file) => writesIn(file).hits.length > 0);
assert.deepEqual(new Set(scriptWriters), SCRIPT_WRITERS, 'the scripts that write Listing, Essay or Seller changed; review the list');
for (const file of scriptFiles) {
  // unstable_cache throws outside a Next request, so no script may load it.
  assert.doesNotMatch(read(file), /lib\/publicCatalog/, `${file} must not import the cached catalogue`);
}

// ---- The query, the fingerprint and the cache ---------------------------

const catalog = read('lib/publicCatalog.ts');
const query = catalog.slice(catalog.indexOf('prisma.listing.findMany({'), catalog.indexOf('const usedHooksBySeller'));
assert.doesNotMatch(stripComments(query), /\binclude:/, 'the catalogue selects columns, it does not include whole rows');
const listingSelect = query.slice(query.indexOf('select: {'), query.indexOf('seller: {'));
const selected = [...listingSelect.matchAll(/^\s+(\w+): true,$/gm)].map((m) => m[1]).sort();
assert.deepEqual(selected, [
  'admitTags', 'aiDecision', 'anonymity', 'appliedMajors', 'applicationSystem', 'createdAt', 'humanReviewedAt',
  'id', 'major', 'openingLine', 'packagePrice', 'school', 'sellerId', 'status', 'targetSchool', 'teaser',
].sort(), 'Listing columns selected by the catalogue');
for (const heavy of ['aiLenses', 'aiReasons', 'sellerNote', 'adminNote']) {
  assert.doesNotMatch(stripComments(query), new RegExp(`\\b${heavy}\\b`), `the catalogue must not read ${heavy}`);
}
assert.match(query, /seller: \{\s*select: \{\s*email: true,\s*name: true,\s*backgroundTags: true,\s*\},\s*\}/);
assert.match(query, /essays: \{ orderBy: \{ sortOrder: 'asc' \}, select: \{ prompt: true, question: true, wordCount: true \} \}/);

// The fingerprint covers exactly the query's rows.
assert.match(query, /where: \{ status: 'approved', packagePrice: \{ not: null \} \}/);
const fingerprint = catalog.slice(catalog.indexOf('async function catalogFingerprint'), catalog.indexOf('async function loadPublicCatalog'));
assert.match(fingerprint, /string_agg\(k, ',' ORDER BY k\)/, 'the fingerprint must be order-stable or the cache never hits');
assert.equal([...fingerprint.matchAll(/status = 'approved' AND (?:l\.)?"packagePrice" IS NOT NULL/g)].length, 3, 'all three row sets mirror the query');
for (const table of ['"Listing" l', '"Essay" e', '"Seller" s']) assert.ok(fingerprint.includes(table), `fingerprint reads ${table}`);
assert.equal(fingerprint.split('xmin::text').length - 1, 3);

// The cache: tagged, an hour as the backstop, keyed by deployment and fingerprint.
assert.match(catalog, /unstable_cache\(/);
assert.match(catalog, /\['public-catalog', DEPLOYMENT_KEY\],\s*\{ tags: \[PUBLIC_CATALOG_TAG\], revalidate: 3600 \}/);
assert.match(catalog, /DEPLOYMENT_KEY = process\.env\.VERCEL_DEPLOYMENT_ID \|\| process\.env\.VERCEL_GIT_COMMIT_SHA \|\| 'local'/);
assert.match(catalog, /return cachedPublicCatalog\(fingerprint\);/);
assert.match(catalog, /catch \(error\) \{[\s\S]{0,200}return loadPublicCatalog\(\);/, 'a fingerprint failure falls back to an uncached read');
assert.doesNotMatch(catalog, /export (async )?function loadPublicCatalog/, 'callers must go through the launch gate and the cache');
assert.ok(catalog.indexOf('marketplaceIsLaunched()') < catalog.indexOf('catalogFingerprint()'), 'the launch gate runs before the cache');

// Every catalogue page reads through the one cached function.
for (const file of ['app/api/listings/route.ts', 'app/essays/page.tsx', 'app/essays/[collection]/page.tsx']) {
  assert.match(read(file), /publicCatalogListings\(\)/, `${file} reads the shared catalogue`);
}

console.log('catalogue cache tests passed');
