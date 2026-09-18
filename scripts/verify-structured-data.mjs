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

console.log('');
if (failures.length) {
  console.log(`${failures.length} failure${failures.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('structured data matches the served HTML');
