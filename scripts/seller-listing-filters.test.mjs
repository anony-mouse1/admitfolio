import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// sellerApplicationsCore imports lib/anonymity, which transpileModule does not
// resolve, so it is inlined as a nested data URL.
const compile = (path) => ts.transpileModule(
  fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const anonymity = dataUrl(compile('../lib/anonymity.ts'));
const core = compile('../components/seller/sellerApplicationsCore.ts')
  .replace("from '../../lib/anonymity'", `from '${anonymity}'`);
const {
  listingFilterForStatus, listingStatusTone, listingFilterCounts, applicationsForFilter,
} = await import(dataUrl(core));

// Published and In review carry only what belongs there.
assert.equal(listingFilterForStatus('approved'), 'published');
assert.equal(listingFilterForStatus('pending'), 'review');

// Terminal listings belong to no chip, so they surface under All only. They
// used to be swept into a "Drafts" chip, which showed a listing labelled
// "Taken down" and no actual draft.
assert.equal(listingFilterForStatus('rejected'), null, 'a rejected listing is not a draft');
assert.equal(listingFilterForStatus('removed'), null, 'a taken down listing is not a draft');
assert.equal(listingFilterForStatus('draft'), null, 'the defensive status is not a chip either');

assert.equal(listingStatusTone('approved'), 'published');
assert.equal(listingStatusTone('pending'), 'review');
assert.equal(listingStatusTone('rejected'), 'closed');
assert.equal(listingStatusTone('removed'), 'closed');

const listing = (id, status) => ({
  id, status, title: `${id} essays`, essayCount: 1, wordCount: null, priceCents: null,
  anonymity: 'anonymous', pricingMode: 'package', packagePrice: null, priceFloor: 1,
  sales: 0, createdAt: '2026-01-01T00:00:00.000Z', essays: [],
});
const applications = [{
  key: 'k', school: 'Cornell University', cycleLabel: '2024', decision: 'admitted',
  verificationStatus: 'verified',
  listings: [listing('a', 'approved'), listing('p', 'pending'), listing('r', 'rejected'), listing('x', 'removed')],
}];

// Counts: All counts everything, the two chips count only their own.
assert.deepEqual(listingFilterCounts(applications), { all: 4, published: 1, review: 1 });

// All shows everything, including both terminal listings.
assert.deepEqual(applicationsForFilter(applications, 'all')[0].listings.map((l) => l.id), ['a', 'p', 'r', 'x']);
assert.deepEqual(applicationsForFilter(applications, 'published')[0].listings.map((l) => l.id), ['a']);
assert.deepEqual(applicationsForFilter(applications, 'review')[0].listings.map((l) => l.id), ['p']);

// A seller whose only listings are terminal still sees them, because All is the
// default. Twelve sellers in production are in exactly this position.
const terminalOnly = [{ ...applications[0], listings: [listing('r', 'rejected'), listing('x', 'removed')] }];
assert.equal(applicationsForFilter(terminalOnly, 'all')[0].listings.length, 2, 'All must never hide a terminal listing');
assert.equal(applicationsForFilter(terminalOnly, 'published').length, 0, 'and Published must not claim them');

const workspace = fs.readFileSync(new URL('../components/seller/SellerApplicationsWorkspace.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(workspace, /draft: 'Drafts'/, 'the Drafts chip must be gone');
assert.match(workspace, /useState<SellerListingFilter>\('all'\)/, 'All must stay the default, or terminal listings load hidden');

console.log('seller listing filter tests passed');
