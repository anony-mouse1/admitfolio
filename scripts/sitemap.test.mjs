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
assert.equal(new Set(collections.map((c) => c.slug)).size, collections.length, 'collection slugs are unique');
for (const collection of collections) {
  assert.match(collection.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${collection.slug} is a clean slug`);
  for (const key of ['name', 'dek', 'title', 'description']) {
    assert.ok(collection[key].length > 0, `${collection.slug} has a ${key}`);
  }
  assert.ok(collection.intro.length >= 2, `${collection.slug} has a real intro`);
  // AGENTS.md: no em dashes in site copy.
  const copy = [collection.name, collection.dek, collection.title, collection.description, ...collection.intro].join(' ');
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
