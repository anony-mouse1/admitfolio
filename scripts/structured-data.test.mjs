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
const { organizationSchema, itemListSchema, absoluteUrl, serializeJsonLd } = await import(
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
assert.match(page, /import \{ organizationSchema, serializeJsonLd \} from '@\/lib\/structuredData';/);
assert.match(
  page,
  /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(organizationSchema\(\)\) \}\}/,
  'the homepage renders the Organization block',
);
// app/page.tsx is a client component, but Next server-renders it, which is why
// the canonical link beside this block is already in the prerendered HTML. The
// block must stay in that same top-level fragment rather than behind any state,
// or it ships only to a browser that runs JavaScript.
const canonicalAt = page.indexOf('<link rel="canonical"');
const scriptAt = page.indexOf('serializeJsonLd(organizationSchema())');
assert.ok(canonicalAt > -1 && scriptAt > canonicalAt, 'and renders it beside the canonical link');
assert.ok(scriptAt - canonicalAt < 600, 'with nothing conditional in between');


// ---- ItemList ----
const list = itemListSchema('Engineering application essays', [
  { name: 'The summer I rebuilt the gearbox', url: absoluteUrl('/essays/engineering?listing=a') },
  { name: 'A bridge that did not hold', url: absoluteUrl('/essays/engineering?listing=b') },
  { name: 'Why I stopped sketching rockets', url: absoluteUrl('/essays/engineering?listing=c') },
]);

// A seller-authored title must not be able to close the JSON-LD script and
// inject another tag into the served page.
const hostile = itemListSchema('Essays', [
  { name: '</script><script>alert(1)</script>', url: absoluteUrl('/essays/engineering?listing=x') },
]);
const safeJson = serializeJsonLd(hostile);
assert.ok(!safeJson.includes('</script>'), 'seller text cannot close the JSON-LD script');
assert.ok(!safeJson.includes('<script>'), 'seller text cannot open an HTML script');
assert.deepEqual(JSON.parse(safeJson), hostile, 'escaping preserves the structured-data value');

assert.equal(list['@context'], 'https://schema.org');
assert.equal(list['@type'], 'ItemList');
assert.equal(list.name, 'Engineering application essays');

// numberOfItems is derived from the array, never passed in, so it cannot claim
// a count the elements do not back up.
assert.equal(list.numberOfItems, 3);
assert.equal(list.itemListElement.length, list.numberOfItems);
assert.deepEqual(
  list.itemListElement.map((entry) => entry.position),
  [1, 2, 3],
  'positions are 1-based and follow the order the page maps in',
);
assert.deepEqual(list.itemListElement[0], {
  '@type': 'ListItem',
  position: 1,
  name: 'The summer I rebuilt the gearbox',
  url: `${ORIGIN}/essays/engineering?listing=a`,
});

assert.equal(itemListSchema('Empty', []).numberOfItems, 0);
assert.deepEqual(itemListSchema('Empty', []).itemListElement, []);

// ---- What a ListItem must NOT carry ----
// A listing has no page of its own, so there is nowhere for an Offer to live.
// Product markup on a page that is not a product page is the most common
// structured-data manual action there is.
const serialised = JSON.stringify(list);
for (const forbidden of ['Product', 'Offer', 'price', 'priceCurrency', 'availability', 'aggregateRating', 'review']) {
  assert.ok(!serialised.includes(forbidden), `a ListItem must not carry ${forbidden}`);
}
for (const entry of list.itemListElement) {
  assert.deepEqual(
    Object.keys(entry).sort(),
    ['@type', 'name', 'position', 'url'],
    'a ListItem is exactly a type, a position, the rendered name and the rendered href',
  );
}
// itemListOrder would have to be one of schema.org's three. The catalogue comes
// back newest-reviewed first, which is none of them, and ItemListUnordered
// would say the order means nothing when it does.
assert.ok(!('itemListOrder' in list), 'no itemListOrder we cannot honestly name');

// ---- The pages emit it, from the array they render ----
const hub = read('app/essays/page.tsx');
const collectionPage = read('app/essays/[collection]/page.tsx');

for (const [name, source] of [['app/essays/page.tsx', hub], ['app/essays/[collection]/page.tsx', collectionPage]]) {
  assert.match(source, /import \{ absoluteUrl, itemListSchema, serializeJsonLd \} from '@\/lib\/structuredData';/, `${name} imports the builder and safe serializer`);
  assert.match(
    source,
    /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(itemList\) \}\}/,
    `${name} renders the ItemList`,
  );
}

// The collection page must build its list from `listings`, the same array the
// cards are mapped over, and take the name from publicListingTitle, the same
// function the card prints. Anything else is a second source of truth.
assert.match(
  collectionPage,
  /const itemList = itemListSchema\(\s*collection\.name,\s*listings\.map\(\(listing\) => \(\{\s*name: publicListingTitle\(listing\),\s*url: absoluteUrl\(`\$\{basePath\}\?listing=\$\{encodeURIComponent\(listing\.id\)\}`\),/,
  'the collection ItemList is built from the rendered listings, named by publicListingTitle',
);
// The card href and the ListItem url have to be the same string. If one ever
// stops encoding the id, this is what catches it.
const card = read('components/CollectionListingCard.tsx');
assert.match(
  card,
  /href=\{`\$\{basePath\}\?listing=\$\{encodeURIComponent\(listing\.id\)\}`\}/,
  'the card href is the same path the ListItem url is built from',
);
assert.match(card, /aria-label=\{publicListingTitle\(listing\)\}/, 'and the same name');

// The hub renders six collection cards and no listings, so its list is the six
// collections, from the registry the grid maps over.
assert.match(
  hub,
  /const itemList = itemListSchema\(\s*'College essay collections',\s*collections\.map\(\(collection\) => \(\{\s*name: collection\.name,\s*url: absoluteUrl\(collectionPath\(collection\.slug\)\),/,
  'the hub ItemList is the six collections',
);
assert.match(hub, /<h1>College essay collections<\/h1>/, 'and its name is the h1 the page renders');
// The hub has no listing cards, so its list must not pretend to hold listings.
assert.doesNotMatch(
  hub,
  /itemListSchema\([\s\S]{0,200}listings\.map/,
  'the hub must not describe listings it does not render',
);

console.log('structured data tests passed');
