#!/usr/bin/env node

// Every number printed in app/guides/engineering-application-essays/page.tsx,
// recomputed from the live public catalogue so the article can be rechecked
// rather than trusted.
//
//   node scripts/engineering-guide-figures.mjs
//   CATALOG_URL=http://localhost:3000/api/listings node scripts/engineering-guide-figures.mjs
//
// It reads https://admitfolio.com/api/listings, the same public JSON the
// homepage fetches. It does NOT touch the database, it writes nothing, and it
// prints aggregates only: no listing id, no opening line, no teaser, no seller
// name, no background tag. That is deliberate. The article states counts and
// nothing else for the same reason.
//
// Membership is the engineering rule from lib/collections.ts, reimplemented
// here rather than imported, so a change to that rule shows up as a failure of
// this script to agree with the collection page rather than as both moving
// together in silence.
//
// The figures are a snapshot. The article dates them in one place and phrases
// its advice so it survives them drifting. Re-run this before changing that
// date, and bump `modified` in lib/guides.ts if any figure in the article moves.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const CATALOG_URL = process.env.CATALOG_URL || 'https://admitfolio.com/api/listings';

async function importTypeScript(url) {
  const source = await readFile(url, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const schools = await importTypeScript(new URL('../lib/schools.ts', import.meta.url));

const response = await fetch(CATALOG_URL);
assert.equal(response.status, 200, `${CATALOG_URL} answered ${response.status}`);
const body = await response.json();
assert.ok(body.ok && Array.isArray(body.listings), 'the catalogue API did not answer with listings');
const catalog = body.listings;

// majorTokens and the /engineering/ pattern, copied from lib/collections.ts.
const majorTokens = (listing) => {
  const applied = String(listing.appliedMajors || '').split(',').map((m) => m.trim()).filter(Boolean);
  if (applied.length) return applied;
  return String(listing.major || '').split(',').map((m) => m.trim()).filter(Boolean);
};
const ENGINEERING = /engineering/;
const listings = catalog.filter((l) => majorTokens(l).some((t) => ENGINEERING.test(t.toLowerCase())));

const PERSONAL_STATEMENT = 'Common App · Personal Statement';
const PIQ = 'UC · Personal Insight Question';
// Everything that is neither of the two above. Named rather than inferred so a
// new prompt type added to the site fails the total below instead of being
// quietly counted as a supplement.
const SUPPLEMENTS = new Set([
  'Why-school · Supplement',
  'Community / Identity · Supplement',
  'Intellectual vitality · Supplement',
  'Activity / Extracurricular · Supplement',
  'Other supplement',
  'Short answer',
]);

const essays = listings.flatMap((l) => l.essays);
const countEssays = (fn) => essays.filter(fn).length;
const has = (l, prompt) => l.essays.some((e) => e.prompt === prompt);
const suppCount = (l) => l.essays.filter((e) => SUPPLEMENTS.has(e.prompt)).length;

const personalStatements = countEssays((e) => e.prompt === PERSONAL_STATEMENT);
const piqs = countEssays((e) => e.prompt === PIQ);
const supplements = countEssays((e) => SUPPLEMENTS.has(e.prompt));
assert.equal(
  personalStatements + piqs + supplements,
  essays.length,
  'every essay must fall into exactly one of the three buckets the article names',
);

const shortAnswers = countEssays((e) => e.prompt === 'Short answer');
const shortAnswerListings = listings.filter((l) => has(l, 'Short answer'));
const piqListings = listings.filter((l) => has(l, PIQ));
const fullPiqSets = piqListings.filter((l) => l.essays.filter((e) => e.prompt === PIQ).length === 4);
const withStatement = listings.filter((l) => has(l, PERSONAL_STATEMENT));

// Discipline labels are free text a seller typed. They are reported as label
// groups, never as a claim about how many distinct disciplines exist: three of
// the labels below are the same discipline spelled differently.
const labels = new Map();
for (const listing of listings) {
  const engineeringLabels = new Set(
    majorTokens(listing).filter((t) => ENGINEERING.test(t.toLowerCase())).map((t) => t.toLowerCase().trim()),
  );
  for (const label of engineeringLabels) labels.set(label, (labels.get(label) || 0) + 1);
}
const labelled = (re) => listings.filter((l) => majorTokens(l).some((t) => re.test(t.toLowerCase()))).length;
const UNCOMMITTED = /undeclared engineering|general engineering|engineering \(first-year\)|engineering & science|^engineering$/;

// Colleges, counted the way lib/collectionSummary.ts counts them: once per
// listing per resolved school, keyed on the domain so two spellings are one row.
const NOT_A_SCHOOL = new Set(['questbridge.org', 'gatesscholarship.org']);
const colleges = new Map();
const unresolved = new Set();
for (const listing of listings) {
  const seen = [];
  for (const tag of listing.verifiedAdmitTags || []) {
    const info = schools.schoolInfo(tag);
    if (!info) unresolved.add(tag);
    if (info && NOT_A_SCHOOL.has(info.domain)) continue;
    const key = info ? info.domain : `raw:${tag.toLowerCase().trim()}`;
    if (seen.includes(key)) continue;
    if (!info && seen.some((k) => k.startsWith('raw:') && schools.sameSchool(k.slice(4), tag))) continue;
    seen.push(key);
    const row = colleges.get(key) || { label: info ? info.short : schools.schoolShortName(tag), count: 0 };
    row.count += 1;
    colleges.set(key, row);
  }
}
const repeated = [...colleges.values()].filter((row) => row.count > 1);

const prices = listings.map((l) => l.price).filter((p) => typeof p === 'number').sort((a, b) => a - b);

const say = (label, value) => console.log(`${String(value).padStart(5)}  ${label}`);

console.log(`\n${CATALOG_URL}`);
console.log(`catalogue: ${catalog.length} listings\n`);

console.log('-- the stat block --');
say('engineering listings', listings.length);
say('essays in them', essays.length);
say('  Common App personal statements', personalStatements);
say('  UC Personal Insight Questions', piqs);
say('  supplements and short answers', supplements);

console.log('\n-- what a listing holds --');
const withoutStatement = listings.filter((l) => !has(l, PERSONAL_STATEMENT));
say('listings holding a personal statement', withStatement.length);
say('  of those, the statement and nothing else', listings.filter((l) => l.essays.length === 1 && has(l, PERSONAL_STATEMENT)).length);
say('  of those, paired with a supplement or short answer', withStatement.filter((l) => suppCount(l) > 0).length);
say('listings holding no personal statement at all', withoutStatement.length);
say('  of those, PIQ sets, where there is no statement to write', withoutStatement.filter((l) => l.essays.every((e) => e.prompt === PIQ)).length);
say('  of those, supplements and short answers on their own', withoutStatement.filter((l) => l.essays.every((e) => SUPPLEMENTS.has(e.prompt))).length);
say('most supplements and short answers in one listing', Math.max(...listings.map(suppCount)));
// The article calls these three shapes exhaustive, so they have to be.
assert.equal(
  listings.filter((l) => l.essays.length === 1 && has(l, PERSONAL_STATEMENT)).length
    + withStatement.filter((l) => suppCount(l) > 0).length
    + withoutStatement.length,
  listings.length,
  'every listing must fall into exactly one of the three shapes the article names',
);

console.log('\n-- short answers --');
say('short answers in the collection', shortAnswers);
say('listings they sit in', shortAnswerListings.length);
say('most in one listing', Math.max(0, ...shortAnswerListings.map((l) => l.essays.filter((e) => e.prompt === 'Short answer').length)));

console.log('\n-- UC --');
say('listings holding PIQs', piqListings.length);
say('  of those, complete sets of four', fullPiqSets.length);

console.log('\n-- discipline labels --');
say('distinct labels typed by sellers', labels.size);
for (const [label, count] of [...labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  say(label, count);
}
console.log('  grouped:');
say('  biomedical or bioengineering', labelled(/biomedical engineering|bioengineering/));
say('  aerospace', labelled(/aerospace engineering/));
say('  mechanical', labelled(/mechanical engineering/));
say('  undeclared, general or first-year', labelled(UNCOMMITTED));

console.log('\n-- colleges --');
say('distinct colleges across the collection', colleges.size);
say('colleges appearing in more than one listing', repeated.length);
console.log('  the ones appearing three times or more:');
for (const row of repeated.filter((r) => r.count >= 3).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))) {
  say(`  ${row.label}`, row.count);
}

console.log('\n-- price --');
say('lowest', prices[0]);
say('highest', prices.at(-1));
say('median', prices[Math.floor(prices.length / 2)]);

console.log('\n-- found while counting, not used in the article --');
say('essays in the whole catalogue carrying a numeric wordCount', catalog.flatMap((l) => l.essays).filter((e) => typeof e.wordCount === 'number' && e.wordCount > 0).length);
say('essays in the whole catalogue', catalog.flatMap((l) => l.essays).length);
say('engineering essays carrying the college\'s own question text', essays.filter((e) => (e.question || '').trim()).length);
console.log(`       prompts those sit under: ${[...new Set(essays.filter((e) => (e.question || '').trim()).map((e) => e.prompt))].join(', ')}`);
say('engineering admit tags lib/schools.ts cannot resolve', unresolved.size);
console.log(`       ${[...unresolved].sort().join(' | ')}`);
console.log('');
