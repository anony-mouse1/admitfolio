#!/usr/bin/env node

// What the site is allowed to claim in JSON-LD.
//
// Pure node: no server, no browser, no database. lib/structuredData.ts is
// transpiled and imported the way the other tests import lib/*.ts, and the
// pages that emit it are checked as source.
//
// The assertions worth keeping are the negative ones. Structured data that
// describes something the page does not render is a spam violation, and the
// penalty lands on the whole site rather than on the one page, so this file
// spends most of its length insisting that certain fields are absent. Every
// one of them is a field somebody will eventually be tempted to add because a
// generator suggested it.
//
// scripts/verify-structured-data.mjs is the other half, and the one that
// actually proves the claim: it reads the served HTML and requires every
// value here to match what that document renders.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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

const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.NEXT_PUBLIC_SITE_URL;
const siteModule = toDataUrl(read('lib/site.ts'));
const site = await import(siteModule);
const { organizationSchema } = await import(
  toDataUrl(relink(read('lib/structuredData.ts'), './site', siteModule))
);
if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;

const ORIGIN = 'https://admitfolio.com';
assert.equal(site.SITE_URL, ORIGIN, 'the default origin is the apex');

// ---- Organization ----
const org = organizationSchema();

assert.equal(org['@context'], 'https://schema.org');
assert.equal(org['@type'], 'Organization');
assert.equal(org.name, 'Admitfolio');
assert.equal(org.url, `${ORIGIN}/`);
assert.equal(org.logo, `${ORIGIN}/apple-icon.png`);

// The description is not a second copy of the meta description, it is the same
// constant. app/layout.tsx assigns SITE_DESCRIPTION to the description it puts
// in the document, so if these two ever disagree the constant has been forked.
assert.equal(org.description, site.SITE_DESCRIPTION);
const layout = read('app/layout.tsx');
assert.match(
  layout,
  /const homeDescription = SITE_DESCRIPTION;/,
  'the meta description must come from the same constant the Organization block publishes',
);
assert.match(layout, /description: homeDescription,/, 'and be the description Next renders');
assert.match(layout, /siteName: SITE_NAME,/, 'the OpenGraph site name comes from the same constant too');

// ---- What the Organization block must NOT claim ----
// sameAs: Admitfolio has no social account of its own. The site's one social
// link is the founder's personal Instagram under a different name, and sameAs
// would assert the two are the same organisation.
assert.ok(!('sameAs' in org), 'no sameAs until Admitfolio has a profile of its own');
assert.ok(!('foundingDate' in org), 'no foundingDate: nothing in the repo records one');
assert.ok(!('address' in org), 'no address: nothing in the repo records one');
assert.ok(!('telephone' in org), 'no telephone: the site publishes no phone number');
assert.ok(!('founder' in org), 'no founder object beyond what the FAQ prose already says');
assert.ok(!('aggregateRating' in org), 'no ratings: the site collects none');

const structured = read('lib/structuredData.ts');
assert.doesNotMatch(
  structured.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
  /instagram|fatimahs\.guide/i,
  'the founder\'s personal account must not be promoted into Admitfolio\'s markup',
);

// ---- The homepage actually emits it ----
const page = read('app/page.tsx');
assert.match(page, /import \{ organizationSchema \} from '@\/lib\/structuredData';/);
assert.match(
  page,
  /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify\(organizationSchema\(\)\) \}\}/,
  'the homepage renders the Organization block',
);
// app/page.tsx is a client component, but Next server-renders it, which is why
// the canonical link beside this block is already in the prerendered HTML. The
// block must stay in that same top-level fragment rather than behind any state,
// or it ships only to a browser that runs JavaScript.
const canonicalAt = page.indexOf('<link rel="canonical"');
const scriptAt = page.indexOf('JSON.stringify(organizationSchema())');
assert.ok(canonicalAt > -1 && scriptAt > canonicalAt, 'and renders it beside the canonical link');
assert.ok(scriptAt - canonicalAt < 600, 'with nothing conditional in between');

console.log('structured data tests passed');
