#!/usr/bin/env node
// Reads the JSON-LD out of the SERVED HTML and checks every field against what
// that same document renders.
//
// This is the check that matters. scripts/structured-data.test.mjs asserts the
// shape of the objects the builders return, which is a statement about the
// source. Google reads the document, and the rule it enforces is that markup
// must describe visible content, so the only honest verification reads the
// document too. A field that is right in lib/structuredData.ts and wrong in the
// HTML is exactly the failure that earns a manual action.
//
// Not in package.json and not eligible for test:*, which is pure: this needs a
// running server. Run it against `npx next start`, never `npm run build`.
//
//   npx next build && npx next start -p 3111
//   node scripts/verify-structured-data.mjs http://localhost:3111
//
// It also runs against production, read only:
//   node scripts/verify-structured-data.mjs https://admitfolio.com
//
// Every request is a GET of a public page. It writes nothing, submits nothing,
// and never opens checkout.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const BASE = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

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

// Evaluate lib/site.ts against the origin being probed, so a local run expects
// localhost URLs in the markup and a production run expects the apex.
process.env.NEXT_PUBLIC_SITE_URL = BASE;
const siteModule = toDataUrl(read('lib/site.ts'));
const site = await import(siteModule);
// lib/collections.ts imports GuideSlug as a type only, so transpiling drops it
// and only lib/site.ts has to be relinked. Same arrangement as the other
// verifiers.
const { collections, collectionPath, COLLECTIONS_PATH } = await import(
  toDataUrl(relink(read('lib/collections.ts'), './site', siteModule))
);

const failures = [];
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures.push(m); };

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Every application/ld+json block in a document, parsed. */
function jsonLdBlocks(html, where) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch (error) {
      fail(`${where} has a JSON-LD block that is not valid JSON: ${error.message}`);
      continue;
    }
    blocks.push(parsed);
  }
  return blocks;
}

// Attribute order is whatever the renderer chose, so match the tag first and
// pull the two attributes out of it rather than assuming name comes before
// content.
function metaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const named = /\bname="([^"]*)"/i.exec(tag);
    if (!named || named[1].toLowerCase() !== name.toLowerCase()) continue;
    const content = /\bcontent="([^"]*)"/i.exec(tag);
    if (content) return decodeEntities(content[1]);
  }
  return null;
}

function h1Text(html) {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, '')).trim() : null;
}

/** The visible card titles, in document order. This is .ecard-hook's text. */
function cardTitles(html) {
  const titles = [];
  const re = /<div class="ecard-hook"[^>]*>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = re.exec(html)) !== null) titles.push(decodeEntities(match[1]).trim());
  return titles;
}

/** The card hrefs, in document order. */
function cardHrefs(html, basePath) {
  const hrefs = [];
  const re = new RegExp(`href="(${basePath.replace(/[/-]/g, '\\$&')}\\?listing=[^"]*)"`, 'g');
  let match;
  while ((match = re.exec(html)) !== null) hrefs.push(decodeEntities(match[1]));
  return hrefs;
}

/** The hub's collection card hrefs, in document order. */
function hubHrefs(html) {
  const hrefs = [];
  const re = /href="(\/essays\/[a-z0-9-]+)"/g;
  let match;
  while ((match = re.exec(html)) !== null) hrefs.push(match[1]);
  return hrefs;
}

/** The hub's collection card titles, in document order. */
function hubTitles(html) {
  const titles = [];
  const re = /<div class="[^"]*hubCardTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = re.exec(html)) !== null) titles.push(decodeEntities(match[1]).trim());
  return titles;
}

async function page(pagePath) {
  const res = await fetch(`${BASE}${pagePath}`, { redirect: 'manual' });
  const html = await res.text();
  return { status: res.status, html, blocks: jsonLdBlocks(html, pagePath) };
}

console.log(`base ${BASE}\n`);
console.log('checks');

// ---- Homepage: Organization ----
const home = await page('/');

// Preflight, before any field is compared. Every absolute URL in the markup is
// built from NEXT_PUBLIC_SITE_URL as it was at BUILD time, and this script
// evaluates lib/site.ts against the origin it is probing. Those are the same
// value in both intended uses (production probed at the apex, or a local
// production build started on the port .env.local names) and different the
// moment a build is served on another port. Without this, that one mistake
// reports as eight unrelated URL mismatches. The canonical link is the
// cheapest thing on the page that states the origin it was built for.
const canonical = /<link rel="canonical" href="([^"]+)"/.exec(home.html);
if (home.status === 200 && canonical) {
  const builtFor = new URL(canonical[1]).origin;
  if (builtFor !== BASE) {
    console.log(`  FAIL  the server at ${BASE} was built for ${builtFor}, so every absolute URL in its markup names that origin.`);
    console.log(`        Rebuild it with NEXT_PUBLIC_SITE_URL=${BASE}, or probe it at ${builtFor}.`);
    console.log('\n1 failure');
    process.exit(1);
  }
}

if (home.status !== 200) {
  fail(`/ returned ${home.status}`);
} else {
  const org = home.blocks.find((b) => b['@type'] === 'Organization');
  if (!org) {
    fail('/ serves no Organization block. It is rendered in app/page.tsx beside the canonical link.');
  } else {
    const expect = (field, value) => {
      if (org[field] === value) ok(`/ Organization ${field} is ${JSON.stringify(value)}`);
      else fail(`/ Organization ${field} is ${JSON.stringify(org[field])}, expected ${JSON.stringify(value)}`);
    };
    expect('@context', 'https://schema.org');
    expect('@type', 'Organization');
    expect('name', site.SITE_NAME);
    expect('url', `${site.SITE_URL}/`);

    // The description must be the string this document actually carries, read
    // back out of the served <meta>, not out of the constant the builder used.
    const served = metaContent(home.html, 'description');
    if (served === null) fail('/ serves no meta description to compare the Organization description against');
    else if (served === org.description) ok('/ Organization description is the served meta description, exactly');
    else fail(`/ Organization description differs from the served meta description.\n        meta: ${served}\n        ld:   ${org.description}`);

    // The logo has to be a real image the crawler can fetch. A 404 here is a
    // silently invalid Organization.
    const logoRes = await fetch(org.logo, { redirect: 'follow' });
    const type = logoRes.headers.get('content-type') || '';
    if (logoRes.ok && type.startsWith('image/')) ok(`/ Organization logo ${org.logo} serves ${logoRes.status} ${type}`);
    else fail(`/ Organization logo ${org.logo} serves ${logoRes.status} ${type || '(no content-type)'}`);

    for (const absent of ['sameAs', 'foundingDate', 'address', 'telephone', 'aggregateRating']) {
      if (absent in org) fail(`/ Organization claims ${absent}, which nothing on the site states`);
    }
    if (!('sameAs' in org)) ok('/ Organization claims no sameAs, since Admitfolio has no profile of its own');
  }
}

// ---- The collections hub: ItemList of the six collections ----
const hub = await page(COLLECTIONS_PATH);
if (hub.status !== 200) {
  fail(`${COLLECTIONS_PATH} returned ${hub.status}`);
} else {
  const list = hub.blocks.find((b) => b['@type'] === 'ItemList');
  if (!list) {
    fail(`${COLLECTIONS_PATH} serves no ItemList block`);
  } else {
    const heading = h1Text(hub.html);
    if (list.name === heading) ok(`${COLLECTIONS_PATH} ItemList name is the served h1 (${heading})`);
    else fail(`${COLLECTIONS_PATH} ItemList name is ${JSON.stringify(list.name)}, the served h1 is ${JSON.stringify(heading)}`);

    const hrefs = hubHrefs(hub.html);
    const titles = hubTitles(hub.html);
    if (list.numberOfItems === hrefs.length) ok(`${COLLECTIONS_PATH} numberOfItems is ${hrefs.length}, the number of cards served`);
    else fail(`${COLLECTIONS_PATH} numberOfItems is ${list.numberOfItems}, the page serves ${hrefs.length} collection cards`);

    const elementPaths = list.itemListElement.map((e) => String(e.url).replace(site.SITE_URL, ''));
    if (JSON.stringify(elementPaths) === JSON.stringify(hrefs)) ok(`${COLLECTIONS_PATH} every ItemList url is a card href, in the same order`);
    else fail(`${COLLECTIONS_PATH} ItemList urls do not match the served hrefs.\n        ld:   ${elementPaths.join(', ')}\n        page: ${hrefs.join(', ')}`);

    const elementNames = list.itemListElement.map((e) => e.name);
    if (JSON.stringify(elementNames) === JSON.stringify(titles)) ok(`${COLLECTIONS_PATH} every ItemList name is a served card title`);
    else fail(`${COLLECTIONS_PATH} ItemList names do not match the served card titles.\n        ld:   ${elementNames.join(' | ')}\n        page: ${titles.join(' | ')}`);
  }
}

// ---- The six collection pages: ItemList of the listings they render ----
for (const collection of collections) {
  const basePath = collectionPath(collection.slug);
  const result = await page(basePath);
  if (result.status !== 200) {
    fail(`${basePath} returned ${result.status}`);
    continue;
  }
  const list = result.blocks.find((b) => b['@type'] === 'ItemList');
  if (!list) {
    fail(`${basePath} serves no ItemList block`);
    continue;
  }

  const heading = h1Text(result.html);
  if (list.name === heading) ok(`${basePath} ItemList name is the served h1`);
  else fail(`${basePath} ItemList name is ${JSON.stringify(list.name)}, the served h1 is ${JSON.stringify(heading)}`);

  // The one assertion this whole file exists for. Every ListItem must be a card
  // the served document actually shows, with the same text and the same href,
  // in the same order. A listing described in markup and missing from the page
  // is the violation; a card on the page and missing from the markup is an
  // incomplete list.
  const titles = cardTitles(result.html);
  const hrefs = cardHrefs(result.html, basePath);
  if (titles.length !== hrefs.length) {
    fail(`${basePath} serves ${titles.length} card titles and ${hrefs.length} card hrefs, which should be equal`);
    continue;
  }
  if (list.numberOfItems === titles.length) ok(`${basePath} numberOfItems is ${titles.length}, the number of cards served`);
  else fail(`${basePath} numberOfItems is ${list.numberOfItems}, the page serves ${titles.length} cards`);

  const elementNames = list.itemListElement.map((e) => e.name);
  const elementPaths = list.itemListElement.map((e) => String(e.url).replace(site.SITE_URL, ''));
  if (JSON.stringify(elementNames) === JSON.stringify(titles)) ok(`${basePath} every ItemList name is a served card title, in order`);
  else {
    const at = elementNames.findIndex((name, i) => name !== titles[i]);
    fail(`${basePath} ItemList name ${at + 1} is ${JSON.stringify(elementNames[at])}, the card there reads ${JSON.stringify(titles[at])}`);
  }
  if (JSON.stringify(elementPaths) === JSON.stringify(hrefs)) ok(`${basePath} every ItemList url is a served card href, in order`);
  else {
    const at = elementPaths.findIndex((url, i) => url !== hrefs[i]);
    fail(`${basePath} ItemList url ${at + 1} is ${JSON.stringify(elementPaths[at])}, the card there links ${JSON.stringify(hrefs[at])}`);
  }

  const positions = list.itemListElement.map((e) => e.position);
  const expected = positions.map((_, i) => i + 1);
  if (JSON.stringify(positions) === JSON.stringify(expected)) ok(`${basePath} positions are 1 to ${positions.length}`);
  else fail(`${basePath} positions are not 1 to ${positions.length}`);

  for (const entry of list.itemListElement) {
    const extra = Object.keys(entry).filter((k) => !['@type', 'name', 'position', 'url'].includes(k));
    if (extra.length) fail(`${basePath} a ListItem carries ${extra.join(', ')}; a listing has no page for an Offer to live on`);
  }

  // ---- The query params these six pages read, still working ----
  // This route is force-dynamic precisely because it awaits searchParams for
  // ?listing= and ?checkout=. Adding markup above that read is exactly the kind
  // of change that could move the render, so both are exercised rather than
  // assumed. A GET of ?checkout= opens the dialog; it creates no Stripe session,
  // which only a click in the browser does.
  const firstId = hrefs.length ? decodeURIComponent(hrefs[0].split('?listing=')[1]) : null;
  if (!firstId) {
    fail(`${basePath} serves no listing href to test the query params with`);
    continue;
  }
  for (const [param, marker] of [['listing', 'ecard-hook'], ['checkout', 'buy-overlay']]) {
    const probe = await page(`${basePath}?${param}=${encodeURIComponent(firstId)}`);
    if (probe.status !== 200) {
      fail(`${basePath}?${param}= returned ${probe.status}`);
      continue;
    }
    const stillListed = probe.blocks.find((b) => b['@type'] === 'ItemList');
    if (!stillListed || stillListed.numberOfItems !== list.numberOfItems) {
      fail(`${basePath}?${param}= serves a different ItemList from the bare path`);
    } else if (!probe.html.includes(marker)) {
      fail(`${basePath}?${param}= serves 200 but no ${marker} in the HTML`);
    } else {
      ok(`${basePath}?${param}= still serves 200 with the same ItemList and a server-rendered ${marker}`);
    }
  }

  // A listing id that is not in this collection must still serve the page and
  // the same list, with the "no longer for sale" notice rather than a 404.
  const gone = await page(`${basePath}?listing=does-not-exist`);
  if (gone.status !== 200) fail(`${basePath}?listing=does-not-exist returned ${gone.status}`);
  else if (!gone.html.includes('no longer for sale')) fail(`${basePath}?listing=does-not-exist serves no takedown notice`);
  else ok(`${basePath}?listing= with an unknown id still serves the collection`);
}

// ---- /llms.txt ----
// The body is rendered and asserted line by line in scripts/sitemap.test.mjs,
// which calls the route directly, so this checks the one thing that test
// cannot: that a directory named llms.txt actually registers as a route and
// answers at the root as plain text. A route segment with a dot in it is the
// kind of thing that works until a framework upgrade.
const llms = await fetch(`${BASE}/llms.txt`, { redirect: 'manual' });
const llmsBody = await llms.text();
const llmsType = llms.headers.get('content-type') || '';
if (llms.status !== 200) {
  fail(`/llms.txt returned ${llms.status}`);
} else if (!llmsType.startsWith('text/plain')) {
  fail(`/llms.txt serves ${llmsType}, expected text/plain`);
} else if (!llmsBody.startsWith('# Admitfolio')) {
  fail('/llms.txt does not open with the site name');
} else {
  const links = [...llmsBody.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]);
  ok(`/llms.txt serves ${llms.status} as ${llmsType} with ${links.length} links`);
  // Every URL it hands a crawler has to resolve. A 404 in here sends every
  // agent that reads it to a dead page.
  for (const link of links) {
    const res = await fetch(link, { redirect: 'manual', method: 'HEAD' });
    if (res.status !== 200) fail(`/llms.txt links ${link}, which returns ${res.status}`);
  }
  ok('/llms.txt links only pages that return 200');
}

console.log('');
if (failures.length) {
  console.log(`${failures.length} failure${failures.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('structured data matches the served HTML');
