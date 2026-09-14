#!/usr/bin/env node
// Checks what the collection pages actually serve: the cache posture in the
// response headers, and one listing anchor in the HTML for every listing the
// catalogue says belongs in that collection.
//
// Not in package.json and not eligible for test:*, which is pure: this needs a
// running server. Run it against `npx next start`, never `npm run build`.
//
//   npx next build && npx next start -p 3111
//   node scripts/verify-collection-cache.mjs http://localhost:3111
//
// It also runs against production, read only:
//   node scripts/verify-collection-cache.mjs https://admitfolio.com
//
// Every request is a GET of a public page or of the public catalogue API. It
// writes nothing and never opens checkout.
//
// Two earlier versions of this file were weaker, and both are worth naming so
// they do not come back.
//
// It printed the cache verdict and asserted nothing about it, so it reported
// NOT CACHED for all seven pages and still exited 0. Run against production
// before this branch deployed, it said "all good" about exactly the state the
// branch exists to change. The cache posture is now asserted.
//
// The listing counts were hardcoded at 40, 109, 44, 41, 30, 24, captured the
// day the pages shipped. The catalogue moves whenever an admin approves or
// takes a listing down, so those numbers were a false alarm waiting to happen
// and said nothing about whether the page was right. The expected count now
// comes from lib/collections.ts, the same registry the page filters with,
// applied to the same catalogue the page renders from. A new approval moves
// both sides together; a page that silently drops listings still fails.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const BASE = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Same transpile-and-import arrangement the other tests use for lib/*.ts.
function toDataUrl(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

function relink(source, specifier, target) {
  const statement = `from '${specifier}'`;
  assert.ok(source.includes(statement), `expected an import ${statement}`);
  return source.replace(statement, `from '${target}'`);
}

// lib/collections.ts imports GuideSlug as a type only, so transpiling drops it
// and only lib/site.ts has to be relinked.
const siteUrl = toDataUrl(read('lib/site.ts'));
const { collections, listingsInCollection, collectionPath, COLLECTIONS_PATH } = await import(
  toDataUrl(relink(read('lib/collections.ts'), './site', siteUrl))
);

// A guide and the homepage, for contrast. These are the pages the hub was the
// odd one out against.
const REFERENCE = ['/guides/uc-piq-examples', '/'];

function anchorCount(html, pagePath) {
  if (pagePath === COLLECTIONS_PATH) {
    return (html.match(/href="\/essays\/[a-z-]+"/g) || []).length;
  }
  const needle = `href="${pagePath}?listing=`;
  let n = 0;
  let i = 0;
  for (;;) {
    const at = html.indexOf(needle, i);
    if (at === -1) break;
    n += 1;
    i = at + needle.length;
  }
  return n;
}

async function probe(pagePath) {
  const started = process.hrtime.bigint();
  const res = await fetch(`${BASE}${pagePath}`, { redirect: 'manual' });
  const html = await res.text();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const h = (name) => res.headers.get(name) || '';
  return {
    path: pagePath,
    status: res.status,
    ms: Math.round(ms),
    cacheControl: h('cache-control') || '(none)',
    prerender: h('x-nextjs-prerender'),
    nextCache: h('x-nextjs-cache'),
    vercelCache: h('x-vercel-cache'),
    anchors: anchorCount(html, pagePath),
  };
}

// Vercel and `next start` describe the same thing with different headers, so
// read both. no-store is decisive on its own: Next sends it for a route it
// rendered dynamically, and nothing caches a response carrying it.
function cacheState(r) {
  if (/no-store/i.test(r.cacheControl)) return 'dynamic';
  const hitish = ['HIT', 'STALE', 'REVALIDATED', 'PRERENDER'];
  if (hitish.includes(r.vercelCache.toUpperCase())) return 'cached';
  if (hitish.includes(r.nextCache.toUpperCase())) return 'cached';
  if (r.prerender) return 'cached';
  if (r.vercelCache) return `cold (${r.vercelCache})`;
  return 'unknown';
}

async function catalogue() {
  const res = await fetch(`${BASE}/api/listings`);
  if (res.status === 503) return { closed: true, listings: [] };
  if (!res.ok) throw new Error(`/api/listings returned ${res.status}`);
  const body = await res.json();
  return { closed: false, listings: body.listings || [] };
}

// Read the catalogue either side of the page sweep. If an approval lands
// mid-run the two disagree, and that is a moving catalogue rather than a broken
// page: 41a5c90 hit exactly this comparing the API against production twice.
const before = await catalogue();
const paths = [COLLECTIONS_PATH, ...collections.map((c) => collectionPath(c.slug))];
const cold = [];
for (const p of paths) cold.push(await probe(p));
const warm = [];
for (const p of paths) warm.push(await probe(p));
const after = await catalogue();
const refs = [];
for (const p of REFERENCE) refs.push(await probe(p));

function expectedFor(slug, snapshot) {
  const collection = collections.find((c) => c.slug === slug);
  return listingsInCollection(snapshot.listings, collection.rule).length;
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`base ${BASE}`);
console.log(`catalogue ${before.closed ? '(marketplace closed)' : `${before.listings.length} listings`}\n`);
console.log(pad('path', 42) + pad('code', 6) + pad('cold/warm ms', 15) + pad('anchors', 9) + pad('state', 16) + 'cache-control');
console.log('-'.repeat(132));
for (let i = 0; i < cold.length; i += 1) {
  const w = warm[i];
  console.log(
    pad(w.path, 42) + pad(w.status, 6) + pad(`${cold[i].ms}/${w.ms}`, 15) + pad(w.anchors, 9) + pad(cacheState(w), 16) + w.cacheControl,
  );
}
console.log('\nreference');
console.log('-'.repeat(132));
for (const r of refs) {
  console.log(pad(r.path, 42) + pad(r.status, 6) + pad(r.ms, 15) + pad(r.anchors, 9) + pad(cacheState(r), 16) + r.cacheControl);
}

const failures = [];
const notes = [];
console.log('\nchecks');
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures.push(m); };
const note = (m) => { console.log(`  note  ${m}`); notes.push(m); };

for (let i = 0; i < warm.length; i += 1) {
  const w = warm[i];
  if (w.status !== 200) {
    fail(`${w.path} returned ${w.status}`);
    continue;
  }

  if (w.path === COLLECTIONS_PATH) {
    // The hub is the page this branch changed, and the only one that must be
    // cached. A cold CDN node is not a pass: the warm probe follows the cold
    // one, so by now it should be served from cache.
    const state = cacheState(w);
    if (state === 'cached') {
      ok(`${w.path} is cached (${w.cacheControl})`);
    } else {
      fail(
        `${w.path} is ${state}, expected cached. If this is production, the change may not be deployed yet; ` +
        `otherwise app/essays/page.tsx lost its revalidate.`,
      );
    }
    if (w.anchors === collections.length) ok(`${w.path} links all ${collections.length} collections`);
    else fail(`${w.path} links ${w.anchors} collections, expected ${collections.length}`);
    continue;
  }

  const slug = w.path.slice(COLLECTIONS_PATH.length + 1);

  // Deliberately dynamic: these pages read searchParams for ?listing= and
  // ?checkout=. See the note at the top of app/essays/[collection]/page.tsx.
  // If that decision is ever revisited, this expectation is the one line to
  // change, and the sheet on a ?listing= arrival is what to check first.
  const state = cacheState(w);
  if (state === 'dynamic') ok(`${w.path} is dynamic, as intended`);
  else fail(`${w.path} is ${state}, expected dynamic. Caching it gives up the server-rendered detail sheet: read the note in app/essays/[collection]/page.tsx before accepting this.`);

  if (before.closed || after.closed) {
    note(`${w.path} ${w.anchors} anchors, not checked: the marketplace API answered 503`);
    continue;
  }
  const want = expectedFor(slug, before);
  const wantAfter = expectedFor(slug, after);
  if (want !== wantAfter) {
    note(`${w.path} catalogue moved during the run (${want} then ${wantAfter}), page served ${w.anchors}. Re-run.`);
    continue;
  }
  if (w.anchors === want) ok(`${w.path} ${w.anchors} listing anchors, one per catalogue listing in this collection`);
  else fail(`${w.path} served ${w.anchors} listing anchors, catalogue says ${want}`);
}

if (notes.length) console.log(`\n${notes.length} note${notes.length === 1 ? '' : 's'}, not failures`);
console.log(failures.length ? `\n${failures.length} failure${failures.length === 1 ? '' : 's'}` : '\nall good');
process.exit(failures.length ? 1 : 0);
