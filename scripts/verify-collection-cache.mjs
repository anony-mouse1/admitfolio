#!/usr/bin/env node
// Reads the cache headers the collection pages actually serve, and checks the
// listing anchors are still in the document.
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
// Every request is a GET of a public page. It writes nothing and never opens
// checkout.

const BASE = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '');

// The counts the catalogue served when the collection pages shipped. They move
// when an admin approves or takes down a listing, so a mismatch is a prompt to
// look, not automatically a failure.
const EXPECTED = {
  '/essays': null,
  '/essays/uc-personal-insight-questions': 40,
  '/essays/common-app-personal-statement': 109,
  '/essays/engineering': 44,
  '/essays/business': 41,
  '/essays/biology': 30,
  '/essays/computer-science': 24,
};

// A guide and the homepage, for contrast. These are the pages the collections
// are meant to stop being the odd one out against.
const REFERENCE = ['/guides/uc-piq-examples', '/'];

function anchorCount(html, path) {
  if (path === '/essays') {
    // The hub links to each collection once, in a card.
    return (html.match(/href="\/essays\/[a-z-]+"/g) || []).length;
  }
  const needle = `href="${path}?listing=`;
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

async function probe(path) {
  const started = process.hrtime.bigint();
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  const html = await res.text();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const h = (name) => res.headers.get(name);
  return {
    path,
    status: res.status,
    ms: Math.round(ms),
    cacheControl: h('cache-control') || '(none)',
    prerender: h('x-nextjs-prerender') || '',
    nextCache: h('x-nextjs-cache') || '',
    staleTime: h('x-nextjs-stale-time') || '',
    vercelCache: h('x-vercel-cache') || '',
    age: h('age') || '',
    anchors: anchorCount(html, path),
    bytes: html.length,
  };
}

function verdict(row) {
  const cc = row.cacheControl;
  if (/no-store/.test(cc)) return 'NOT CACHED';
  if (row.vercelCache) return `cdn ${row.vercelCache}`;
  if (row.prerender || row.nextCache) return `cached (${row.nextCache || 'prerender'})`;
  return 'unclear';
}

const rows = [];
for (const path of Object.keys(EXPECTED)) rows.push(await probe(path));
// Second pass: a cached page should report a cache hit the second time.
const warm = [];
for (const path of Object.keys(EXPECTED)) warm.push(await probe(path));
const refs = [];
for (const path of REFERENCE) refs.push(await probe(path));

console.log(`base ${BASE}\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('path', 42) + pad('code', 6) + pad('cold/warm ms', 15) + pad('anchors', 9) + pad('verdict', 14) + 'cache-control',
);
console.log('-'.repeat(130));
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  const w = warm[i];
  console.log(
    pad(r.path, 42) + pad(r.status, 6) + pad(`${r.ms}/${w.ms}`, 15) + pad(r.anchors, 9) + pad(verdict(w), 14) + w.cacheControl,
  );
}
console.log('\nreference');
console.log('-'.repeat(130));
for (const r of refs) {
  console.log(pad(r.path, 42) + pad(r.status, 6) + pad(r.ms, 15) + pad(r.anchors, 9) + pad(verdict(r), 14) + r.cacheControl);
}

let failures = 0;
console.log('\nchecks');
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  const want = EXPECTED[r.path];
  if (r.status !== 200) {
    console.log(`  FAIL ${r.path} returned ${r.status}`);
    failures += 1;
    continue;
  }
  if (want === null) {
    if (r.anchors !== 6) {
      console.log(`  FAIL ${r.path} links ${r.anchors} collections, expected 6`);
      failures += 1;
    } else {
      console.log(`  ok   ${r.path} links all 6 collections`);
    }
    continue;
  }
  if (r.anchors === want) {
    console.log(`  ok   ${r.path} ${r.anchors} listing anchors`);
  } else {
    console.log(`  DIFF ${r.path} ${r.anchors} listing anchors, expected ${want}. A listing was approved or taken down, or the page regressed.`);
    failures += 1;
  }
}

console.log(failures ? `\n${failures} to look at` : '\nall good');
process.exit(failures ? 1 : 0);
