#!/usr/bin/env node

// Checks that the sitemap and robots.txt agree with the guide registry, and
// that neither can tell a crawler the site lives anywhere but the apex.
//
// Pure node: no server, no browser, no database. The metadata routes are
// transpiled and imported the way the other tests import lib/*.ts. Each
// scenario transpiles afresh with a distinguishing comment, so the module cache
// cannot hand back an origin evaluated under an earlier environment.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PRODUCTION_ORIGIN = 'https://admitfolio.com';
const STATIC_PATHS = ['/', '/guides', '/essays', '/privacy', '/terms'];

function toDataUrl(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

// Point one import at an already transpiled module, and fail loudly if the
// import this test expects has moved rather than silently importing nothing.
function relink(source, specifier, target) {
  const statement = `from '${specifier}'`;
  assert.ok(source.includes(statement), `expected an import ${statement}`);
  return source.replace(statement, `from '${target}'`);
}

// Evaluate lib/site.ts, lib/guides.ts, app/sitemap.ts and app/robots.ts under
// `env`, and render both files while it is still applied. NEXT_PUBLIC_SITE_URL
// is read when lib/site.ts evaluates and VERCEL_ENV when the route runs, so
// both have to happen inside the window.
async function render(scenario, env) {
  const keys = ['NEXT_PUBLIC_SITE_URL', 'VERCEL_ENV'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const apply = (values) => {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
  };
  apply(env);
  try {
    const tag = `\n// scenario: ${scenario}\n`;
    const site = toDataUrl(read('lib/site.ts') + tag);
    const guides = toDataUrl(relink(read('lib/guides.ts'), './site', site) + tag);
    // lib/collections.ts imports GuideSlug as a type only, so transpiling drops
    // that import and only lib/site.ts has to be relinked.
    const collections = toDataUrl(relink(read('lib/collections.ts'), './site', site) + tag);
    const sitemap = toDataUrl(
      relink(
        relink(relink(read('app/sitemap.ts'), '@/lib/guides', guides), '@/lib/collections', collections),
        '@/lib/site',
        site,
      ) + tag,
    );
    const robots = toDataUrl(relink(read('app/robots.ts'), '@/lib/site', site) + tag);
    const registry = await import(guides);
    const collectionRegistry = await import(collections);
    const entries = (await import(sitemap)).default();
    const rules = (await import(robots)).default();
    return { registry, collectionRegistry, entries, rules };
  } finally {
    apply(saved);
  }
}

const production = await render('production', { NEXT_PUBLIC_SITE_URL: PRODUCTION_ORIGIN, VERCEL_ENV: 'production' });
const { entries, rules } = production;
const guides = [...production.registry.guides];
const collections = [...production.collectionRegistry.collections];

// The registry and the filesystem agree, in both directions.
const directories = fs
  .readdirSync(path.join(root, 'app/guides'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(
  guides.map((guide) => guide.slug).sort(),
  directories,
  'every article directory is registered and every registered slug has a directory',
);
for (const slug of directories) {
  assert.ok(fs.existsSync(path.join(root, 'app/guides', slug, 'page.tsx')), `${slug} has a page`);
}
assert.equal(new Set(guides.map((guide) => guide.slug)).size, guides.length, 'slugs are unique');

// Registry values are well formed. A date has to round-trip, which catches a
// day that does not exist in its month as well as a typo in the format.
const roundTrips = (iso) => new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
for (const guide of guides) {
  assert.match(guide.published, /^\d{4}-\d{2}-\d{2}$/, `${guide.slug} published is YYYY-MM-DD`);
  assert.match(guide.modified, /^\d{4}-\d{2}-\d{2}$/, `${guide.slug} modified is YYYY-MM-DD`);
  assert.ok(roundTrips(guide.published) && roundTrips(guide.modified), `${guide.slug} dates are real dates`);
  assert.ok(guide.modified >= guide.published, `${guide.slug} was not modified before it was published`);
  assert.match(guide.readTime, /^\d+ min read$/, `${guide.slug} read time`);
  for (const key of ['category', 'coverTitle', 'image', 'imageAlt', 'title', 'description']) {
    assert.ok(guide[key].length > 0, `${guide.slug} has a ${key}`);
  }
  // A declared cover photo has to be on disk. The non-empty check above cannot
  // tell a real path from a typo, and a 404 cover renders as a bare grey box.
  assert.ok(
    fs.existsSync(path.join(root, 'public', guide.image.replace(/^\//, ''))),
    `${guide.slug} points at a cover photo that exists`,
  );
}
// Every `cover` in the registry has a class behind it on the index, or the card
// renders on a bare grey box.
const indexSource = read('app/guides/page.tsx');
for (const cover of new Set(guides.map((guide) => guide.cover))) {
  assert.match(indexSource, new RegExp(`\\b${cover}: styles\\.`), `the index maps the "${cover}" cover to a class`);
  const covered = `cover${cover[0].toUpperCase()}${cover.slice(1)}`;
  assert.match(read('app/guides/guides.module.css'), new RegExp(`\\.${covered}\\b`), `.${covered} exists in the stylesheet`);
}

// The sitemap is exactly the static pages plus every registered guide, all on
// the apex, none with a trailing slash except the root, and none private,
// an API route or noindex.
const paths = entries.map((entry) => new URL(entry.url).pathname).sort();
assert.deepEqual(
  paths,
  [
    ...STATIC_PATHS,
    ...guides.map((guide) => `/guides/${guide.slug}`),
    ...collections.map((collection) => `/essays/${collection.slug}`),
  ].sort(),
  'the sitemap lists exactly the static pages, every registered guide and every registered collection',
);
for (const entry of entries) {
  const { pathname } = new URL(entry.url);
  assert.ok(entry.url.startsWith(`${PRODUCTION_ORIGIN}/`), `${entry.url} is on the apex`);
  assert.ok(pathname === '/' || !pathname.endsWith('/'), `${entry.url} has no trailing slash`);
  assert.doesNotMatch(pathname, /^\/(admin|api|purchase)(\/|$)/, `${entry.url} is not private, an API route or noindex`);
  assert.ok(!('priority' in entry) && !('changeFrequency' in entry), `${entry.url} carries no invented priority or change frequency`);
}

// lastModified comes from the registry and from nowhere else.
const byPath = new Map(entries.map((entry) => [new URL(entry.url).pathname, entry]));
for (const guide of guides) {
  assert.equal(byPath.get(`/guides/${guide.slug}`).lastModified, guide.modified, `${guide.slug} lastmod is its declared modified date`);
}
assert.equal(byPath.get('/guides').lastModified, guides.map((guide) => guide.modified).sort().at(-1), 'the index moves with its newest article');
for (const pathname of ['/', '/privacy', '/terms']) {
  assert.equal(byPath.get(pathname).lastModified, undefined, `${pathname} has no invented date`);
}
// A collection's content moves whenever a listing is approved and nothing
// records that date, so none of them may claim one either.
for (const collection of collections) {
  assert.equal(
    byPath.get(`/essays/${collection.slug}`).lastModified,
    undefined,
    `/essays/${collection.slug} has no invented date`,
  );
}
assert.equal(byPath.get('/essays').lastModified, undefined, '/essays has no invented date');

// The collection registry is well formed, and one dynamic route renders all of
// them, so the check is that the route exists and that every entry is complete
// rather than one directory per slug.
assert.ok(
  fs.existsSync(path.join(root, 'app/essays/[collection]/page.tsx')),
  'one dynamic route renders every collection',
);
assert.ok(fs.existsSync(path.join(root, 'app/essays/page.tsx')), 'the collection hub exists');
const vercelIgnore = read('.vercelignore');
assert.match(
  vercelIgnore,
  /^!app\/essays\/$/m,
  'Vercel must not drop the app/essays route from the deployment output',
);
const collectionHub = read('app/essays/page.tsx');
assert.match(collectionHub, /listings\.length\} listings for sale/, 'the hub labels its listing count accurately');
assert.doesNotMatch(collectionHub, /listings\.length\} essays for sale/, 'the hub must not label listings as essays');
assert.equal(new Set(collections.map((c) => c.slug)).size, collections.length, 'collection slugs are unique');
for (const collection of collections) {
  assert.match(collection.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${collection.slug} is a clean slug`);
  for (const key of ['name', 'dek', 'title', 'description']) {
    assert.ok(collection[key].length > 0, `${collection.slug} has a ${key}`);
  }
  assert.ok(collection.lead.length > 80, `${collection.slug} has a lead paragraph`);
  assert.ok(collection.notes.length >= 1, `${collection.slug} has closing notes`);
  // AGENTS.md: no em dashes in site copy.
  const copy = [collection.name, collection.dek, collection.title, collection.description, collection.lead, ...collection.notes].join(' ');
  assert.doesNotMatch(copy, /[\u2014\u2013]/, `${collection.slug} copy uses no em or en dashes`);
  assert.ok(
    collection.rule.kind === 'prompt' || collection.rule.kind === 'major',
    `${collection.slug} groups by prompt or major, never by seller or school`,
  );
}
// The pages and the hub read their URLs from the registry, exactly as the
// guides do, so a canonical cannot drift from a sitemap entry.
const collectionRoute = read('app/essays/[collection]/page.tsx');
assert.ok(collectionRoute.includes('collectionUrl(collection.slug)'), 'the collection canonical comes from the registry');
assert.ok(collectionRoute.includes('alternates: { canonical: url }'), 'the collection canonical is that URL');
assert.doesNotMatch(collectionRoute, /https:\/\/admitfolio\.com/, 'the collection route has no literal site URL');

// A card link has to be a real href a crawler can follow, and it has to point at
// the collection rather than the homepage. Pointing it at /?listing= is what
// made a click paint the whole homepage before the sheet arrived.
const collectionCard = read('components/CollectionListingCard.tsx');
assert.match(collectionCard, /<a\b/, 'a listing card must be an anchor');
assert.match(collectionCard, /href=\{`\$\{basePath\}\?listing=/, 'a card must link into its own collection');
assert.doesNotMatch(collectionCard, /href=\{`\/\?listing=/, 'a card must not send a visitor to the homepage');

// "Browse more essays from this seller" is a same-seller grouping. lib/anonymity
// exists to stop that being published, so it must never be in the HTML a crawler
// reads: the sheet renders on the server for a ?listing= deep link, and the
// block is gated on a flag that is false until the client has mounted.
const sheet = read('components/ListingDetail.tsx');
const browser = read('components/CollectionBrowser.tsx');
assert.match(sheet, /showSiblings \&\& otherListings\.length > 0/, 'the sibling block must be gated');
assert.match(browser, /showSiblings=\{false\}/, 'the collection sheet must never show siblings');
// Handing listings to a client component serialises every field into the RSC
// payload inside the HTML, so the ids have to be dropped at that boundary or
// the grouping is published in an indexable document.
assert.match(
  collectionRoute,
  /listings\.map\(\(\{ otherListingIds: _siblings, \.\.\.listing \}\) => listing\)/,
  'the collection route must strip sibling ids before they reach the client',
);
assert.match(collectionRoute, /<CollectionBrowser\s+listings=\{browsable\}/, 'and pass the stripped list, not the raw one');
assert.match(browser, /Omit<PublicListing, 'otherListingIds'>/, 'the browser must not accept sibling ids at all');

// A listing that was taken down keeps its indexed link, so the page has to say
// what happened rather than silently ignoring the query.
// The stats band is real indexable text and answers the two questions a buyer
// has on this page, so a layout change must not quietly drop half of it.
for (const [what, pattern] of [
  ['listing count', /summary\.listings/],
  ['essay count', /summary\.essays/],
  ['package count', /summary\.packages/],
  ['price range', /summary\.priceLow/],
  ['essay types', /summary\.prompts\.map/],
  ['where writers got in', /summary\.schools\.map/],
]) {
  assert.match(collectionRoute, pattern, `the stats band must keep its ${what}`);
}
// It sits between the intro and the grid, in one column. Beside the intro,
// whichever of the two was shorter left a hole, and the intro length varies per
// collection while the band's does not.
assert.ok(
  collectionRoute.indexOf('styles.band') > collectionRoute.indexOf('styles.headerText')
    && collectionRoute.indexOf('styles.band') < collectionRoute.indexOf('styles.cards'),
  'the band must sit between the intro and the card grid',
);

assert.match(collectionRoute, /missingListing/, 'a collection must handle a listing id it does not hold');
assert.match(collectionRoute, /no longer for sale/, 'and say so in words');

// Closing the sheet must pop the entry opening it pushed. Pushing a third entry
// is what left a visitor from a collection page stranded on the homepage.
const homepage = read('app/page.tsx');
assert.match(homepage, /detailPushedRef\.current = false;\s*\n\s*\/\/[\s\S]{0,200}window\.history\.back\(\);/, 'closeDetail must pop its own history entry');
assert.doesNotMatch(
  homepage,
  /const closeDetail = useCallback\(\(\) => \{[\s\S]*?url\.searchParams\.delete\('listing'\);\s*\n\s*window\.history\.pushState/,
  'closeDetail must never push on close',
);

// Each article's canonical is the sitemap URL by construction: both come from
// the same registry entry through the same function, and nothing is hardcoded.
for (const guide of guides) {
  const source = read(`app/guides/${guide.slug}/page.tsx`);
  assert.ok(source.includes(`guideBySlug('${guide.slug}')`), `${guide.slug} reads its own registry entry`);
  assert.ok(source.includes('const url = guideUrl(guide.slug);'), `${guide.slug} builds its URL from the registry`);
  assert.ok(source.includes('alternates: { canonical: url }'), `${guide.slug} canonical is that URL`);
  assert.ok(source.includes('publishedTime: guide.published, modifiedTime: guide.modified'), `${guide.slug} dates come from the registry`);
  assert.doesNotMatch(source, /https:\/\/admitfolio\.com\/guides/, `${guide.slug} has no literal guide URL`);
  assert.doesNotMatch(source, /\b\d{4}-\d{2}-\d{2}\b/, `${guide.slug} has no literal date`);
  assert.doesNotMatch(source, /\d+ min read/, `${guide.slug} has no literal read time`);
}
const index = read('app/guides/page.tsx');
assert.ok(index.includes('const url = `${SITE_URL}${GUIDES_PATH}`;'), 'the index builds its URL from SITE_URL');
assert.ok(index.includes('alternates: { canonical: url }'), 'the index canonical is that URL');
assert.ok(!index.includes('https://admitfolio.com'), 'the index has no literal origin');
const related = read('components/RelatedGuides.tsx');
assert.ok(related.includes("from '@/lib/guides'"), 'RelatedGuides reads the registry');
assert.doesNotMatch(related, /title: '/, 'RelatedGuides keeps no map of its own');

// Internal links into the catalogue. A guide that ends at /#browse passes no
// link value to anything: the homepage computes that section's id on the
// client, so #browse is not in the served document, and the collection pages
// were left with the sitemap plus the homepage band and nothing from the
// articles Google had already indexed.
const PAIRED_GUIDES = {
  'uc-piq-examples': 'uc-personal-insight-questions',
  'common-app-essay-examples': 'common-app-personal-statement',
  'common-app-essay-word-count': 'common-app-personal-statement',
  'engineering-application-essays': 'engineering',
};
const collectionSlugs = new Set(collections.map((collection) => collection.slug));
for (const [guideSlug, collectionSlug] of Object.entries(PAIRED_GUIDES)) {
  assert.ok(collectionSlugs.has(collectionSlug), `${guideSlug} pairs with a collection that exists`);
  const source = read(`app/guides/${guideSlug}/page.tsx`);
  assert.ok(
    source.includes(`collectionPathForGuide('${guideSlug}')`),
    `${guideSlug} builds its call to action href from the registry`,
  );
  assert.doesNotMatch(source, /href="\/#browse"/, `${guideSlug} no longer ends at a fragment a crawler cannot see`);
  assert.doesNotMatch(source, /href="\/essays/, `${guideSlug} has no literal collection path`);
}
// And the registry agrees, so a renamed collection cannot leave an article
// pointing at a 404 while this test still passes.
const registrySource = read('lib/collections.ts');
for (const [guideSlug, collectionSlug] of Object.entries(PAIRED_GUIDES)) {
  assert.match(
    registrySource,
    new RegExp(`'${guideSlug}':\\s*'${collectionSlug}'`),
    `the registry pairs ${guideSlug} with ${collectionSlug}`,
  );
}
// The other direction. A collection's `guide` is the "read the method first"
// line on the collection page, so it has to name a guide that exists.
const registryGuideSlugs = new Set(guides.map((guide) => guide.slug));
for (const collection of collections.filter((entry) => 'guide' in entry)) {
  assert.ok(
    registryGuideSlugs.has(collection.guide),
    `/essays/${collection.slug} names a guide "${collection.guide}" that is not in the registry`,
  );
}

// The four that are deliberately unpaired. Each applies to every essay on the
// site rather than to one group of them, or is about supplements, which are not
// a collection. Sending a reader somewhere the article is not about is a worse
// link than no link, so this asserts the absence on purpose.
for (const guideSlug of guides.map((guide) => guide.slug).filter((slug) => !(slug in PAIRED_GUIDES))) {
  const source = read(`app/guides/${guideSlug}/page.tsx`);
  assert.ok(!source.includes('collectionPathForGuide'), `${guideSlug} is deliberately unpaired`);
}

// The homepage collections band is the collection pages' other referring link,
// and it has to stay a real anchor in the server-rendered HTML. An onClick, or
// a band gated on the client-side catalogue fetch, would make it invisible to a
// crawler while still looking right in a browser.
assert.match(
  homepage,
  /<a key=\{entry\.slug\} className="home-collection" href=\{collectionPath\(entry\.slug\)\}>/,
  'each collections band card is an anchor with a real href',
);
assert.doesNotMatch(
  homepage,
  /className="home-collection"[^>]*onClick/,
  'a band card must not be a click handler',
);
assert.match(
  homepage,
  /\{n > 0 && <span className="home-collection-count">/,
  'only the count waits on the client fetch, never the link',
);
assert.match(homepage, /<a className="home-see-more" href=\{COLLECTIONS_PATH\}>/, 'the band closes with a real link to the hub');

// robots.txt: private and API paths blocked, the catalogue the homepage renders
// from left fetchable, /purchase left crawlable so its noindex can be read.
assert.equal(rules.rules.userAgent, '*');
assert.ok(rules.rules.disallow.includes('/admin'), 'robots blocks /admin');
assert.ok(rules.rules.disallow.includes('/api'), 'robots blocks /api');
assert.ok(rules.rules.allow.includes('/api/listings'), 'robots keeps /api/listings fetchable for the homepage render');
assert.ok(!rules.rules.disallow.some((rule) => rule.startsWith('/purchase')), 'robots does not block /purchase');
assert.equal(rules.sitemap, `${PRODUCTION_ORIGIN}/sitemap.xml`, 'robots points at the sitemap');

// Nothing rendered for production may mention localhost or a preview host.
const rendered = JSON.stringify({ entries, rules });
assert.ok(!rendered.includes('localhost'), 'production output never mentions localhost');
assert.ok(!rendered.includes('vercel.app'), 'production output never mentions a preview host');

// With the variable unset the fallback is the apex, so output is identical.
const fallback = await render('fallback', {});
assert.deepEqual(fallback.entries, entries, 'an unset NEXT_PUBLIC_SITE_URL falls back to the apex');
assert.deepEqual(fallback.rules, rules);

// A trailing slash on the right origin is tolerated rather than doubled.
const slashed = await render('trailing slash', { NEXT_PUBLIC_SITE_URL: `${PRODUCTION_ORIGIN}/`, VERCEL_ENV: 'production' });
assert.deepEqual(slashed.entries, entries, 'a trailing slash on the origin is stripped');

// Local builds and previews render their own origin, so the guard below is not
// over-broad and local verification stays possible.
const local = await render('local', { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
assert.ok(local.entries.every((entry) => entry.url.startsWith('http://localhost:3000/')), 'a local build renders its own origin');
const previewOrigin = 'https://admitfolio-git-branch.vercel.app';
const preview = await render('preview', { NEXT_PUBLIC_SITE_URL: previewOrigin, VERCEL_ENV: 'preview' });
assert.ok(preview.entries.every((entry) => entry.url.startsWith(`${previewOrigin}/`)), 'a preview deploy renders its own origin');

// The production deployment refuses to publish anything but the apex.
for (const origin of ['http://localhost:3000', 'https://www.admitfolio.com', 'https://admitfolio-git-main.vercel.app']) {
  await assert.rejects(
    render(`guard ${origin}`, { NEXT_PUBLIC_SITE_URL: origin, VERCEL_ENV: 'production' }),
    /production deployment must use https:\/\/admitfolio\.com/,
    `production refuses to publish ${origin}`,
  );
}

// None of this reads the database.
for (const file of ['app/sitemap.ts', 'app/robots.ts', 'lib/guides.ts', 'lib/site.ts']) {
  assert.doesNotMatch(read(file), /prisma/i, `${file} does not touch the database`);
}

console.log('sitemap tests passed');
