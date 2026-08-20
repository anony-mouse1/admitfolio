import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const schools = await importTypeScript(new URL('../lib/schools.ts', import.meta.url));
const listingOrder = await importTypeScript(new URL('../lib/listingOrder.ts', import.meta.url));

assert.equal(schools.nationalUniversityRank('Princeton University'), 1);
assert.equal(schools.nationalUniversityRank('MIT'), 2);
assert.equal(schools.nationalUniversityRank('Harvard'), 3);
assert.equal(schools.nationalUniversityRank('Stanford'), 4);
assert.equal(schools.nationalUniversityRank('Yale University'), 4, 'ties must share a rank');
assert.equal(schools.nationalUniversityRank('Cornell University'), 12);
assert.equal(schools.nationalUniversityRank('Columbia University'), 15);
assert.equal(schools.nationalUniversityRank('UC Berkeley'), 15);
assert.equal(schools.nationalUniversityRank('Penn State'), null, 'Penn State must not inherit UPenn rank');
assert.equal(schools.nationalUniversityRank('Binghamton University'), null, 'schools outside the top 50 use the fallback order');
assert.equal(
  schools.schoolShortName('University of Washington'),
  'University of Washington',
  'Washington must use its full name on every shared school label',
);
assert.deepEqual(
  schools.schoolInfo('UW'),
  { domain: 'washington.edu', short: 'University of Washington' },
  'the live UW alias must resolve to University of Washington',
);
assert.deepEqual(
  schools.schoolInfo('IU Kelley'),
  { domain: 'indiana.edu', short: 'Indiana' },
  'the live IU Kelley alias must resolve to Indiana University',
);
assert.deepEqual(
  schools.schoolInfo('UFlorida'),
  { domain: 'ufl.edu', short: 'Florida' },
  'the live UFlorida alias must resolve to University of Florida',
);

// Keep this fixture comparator in lockstep with the public catalogue's sorting
// contract: exact national rank, then the broader tier, then canonical school
// name. The fixtures deliberately mix single essays and packages so a ranking
// change cannot accidentally hide one listing type at the top of Browse.
function compareFixtureRank(a, b) {
  const rankA = schools.nationalUniversityRank(a.school);
  const rankB = schools.nationalUniversityRank(b.school);
  if (rankA != null || rankB != null) {
    if (rankA == null) return 1;
    if (rankB == null) return -1;
    if (rankA !== rankB) return rankA - rankB;
  }
  const tierDifference = a.tier - b.tier;
  if (tierDifference) return tierDifference;
  return schools.schoolShortName(a.school).localeCompare(schools.schoolShortName(b.school));
}

const browseFixtures = [
  { id: 'yale-package', school: 'Yale University', essayCount: 3, tier: 0 },
  { id: 'stanford-package', school: 'Stanford University', essayCount: 6, tier: 0 },
  { id: 'harvard-single', school: 'Harvard College', essayCount: 1, tier: 0 },
];
const rankedBrowseFixtures = [...browseFixtures].sort(compareFixtureRank);

assert.deepEqual(
  rankedBrowseFixtures.map((listing) => schools.schoolShortName(listing.school)),
  ['Harvard', 'Stanford', 'Yale'],
  'Browse should start Harvard, Stanford, then Yale for this representative fixture',
);
assert.deepEqual(
  new Set(rankedBrowseFixtures.slice(0, 3).map((listing) => listing.essayCount === 1 ? 'single' : 'package')),
  new Set(['single', 'package']),
  'the first three ranked fixtures must include both a single essay and a package',
);

const expandedTopSchools = [
  ...browseFixtures,
  { id: 'mit-single', school: 'Massachusetts Institute of Technology', essayCount: 1, tier: 0 },
  { id: 'princeton-package', school: 'Princeton University', essayCount: 4, tier: 0 },
].sort(compareFixtureRank);
assert.deepEqual(
  expandedTopSchools.slice(0, 3).map((listing) => schools.schoolShortName(listing.school)),
  ['Princeton', 'MIT', 'Harvard'],
  'Princeton and MIT must precede Harvard when listings for them exist',
);

const tiedRankFixtures = [
  { id: 'yale', school: 'Yale', essayCount: 1, tier: 0 },
  { id: 'stanford', school: 'Stanford', essayCount: 2, tier: 0 },
].sort(compareFixtureRank);
assert.deepEqual(
  tiedRankFixtures.map((listing) => listing.id),
  ['stanford', 'yale'],
  'rank ties use the canonical school name as a deterministic fallback',
);

const aliasFixtures = [
  { id: 'typed-first', school: 'Stanford University', essayCount: 2, tier: 0 },
  { id: 'short-second', school: 'Stanford', essayCount: 1, tier: 0 },
].sort(compareFixtureRank);
assert.deepEqual(
  aliasFixtures.map((listing) => listing.id),
  ['typed-first', 'short-second'],
  'aliases resolve to the same canonical school and retain stable input order',
);

const fallbackFixtures = [
  { id: 'alphabetically-later', school: 'Villanova', essayCount: 1, tier: 2 },
  { id: 'better-tier', school: 'Amherst', essayCount: 2, tier: 0 },
  { id: 'alphabetically-earlier', school: 'Binghamton University', essayCount: 1, tier: 2 },
].sort(compareFixtureRank);
assert.deepEqual(
  fallbackFixtures.map((listing) => listing.id),
  ['better-tier', 'alphabetically-earlier', 'alphabetically-later'],
  'unranked schools use the broader tier before alphabetic school order',
);

const repeatedSchoolFixtures = [
  { id: 'harvard', school: 'Harvard' },
  { id: 'stanford-1', school: 'Stanford' },
  { id: 'stanford-2', school: 'Stanford' },
  { id: 'stanford-3', school: 'Stanford' },
  { id: 'yale', school: 'Yale' },
  { id: 'cornell', school: 'Cornell' },
  { id: 'upenn', school: 'UPenn' },
];
const spreadFixtures = listingOrder.spreadRepeatedKeys(
  repeatedSchoolFixtures,
  (listing) => schools.schoolInfo(listing.school)?.domain || listing.school.toLowerCase(),
);
assert.deepEqual(
  spreadFixtures.slice(0, 5).map((listing) => listing.school),
  ['Harvard', 'Stanford', 'Yale', 'Cornell', 'UPenn'],
  'Browse should mix top schools before repeating Stanford listings',
);
assert.deepEqual(
  spreadFixtures.filter((listing) => listing.school === 'Stanford').map((listing) => listing.id),
  ['stanford-1', 'stanford-2', 'stanford-3'],
  'diversifying schools must preserve the original ranking within one school',
);

console.log('university rank tests passed');
