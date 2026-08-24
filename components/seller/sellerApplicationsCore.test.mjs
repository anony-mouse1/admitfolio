import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function transpile(path) {
  return ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const anonymityUrl = `data:text/javascript;base64,${Buffer.from(transpile('../../lib/anonymity.ts')).toString('base64')}`;
const coreSource = transpile('./sellerApplicationsCore.ts')
  .replace("from '../../lib/anonymity'", `from '${anonymityUrl}'`);
const core = await import(`data:text/javascript;base64,${Buffer.from(coreSource).toString('base64')}`);

const listing = (id, status, anonymity = 'anonymous') => ({
  id,
  title: `Listing ${id}`,
  essayCount: 1,
  wordCount: 500,
  priceCents: 1200,
  status,
  anonymity,
});

const applications = [{
  key: 'stanford-2024',
  school: 'Stanford',
  cycleLabel: '2024',
  classYear: '2028',
  decision: 'admitted',
  verificationStatus: 'verified',
  listings: [
    listing('listing-published', 'approved', 'full'),
    listing('listing-review', 'pending', 'revealOnPurchase'),
    listing('listing-draft', 'draft'),
    listing('listing-rejected', 'rejected'),
  ],
}];

assert.equal(core.anonymitySummary('full'), 'Full name is public');
assert.equal(core.anonymitySummary('revealOnPurchase'), 'Anonymous publicly, first name after purchase');
assert.equal(core.anonymitySummary('firstName'), 'Anonymous publicly, first name after purchase');
assert.equal(core.anonymitySummary('anonymous'), 'Seller name stays hidden');

assert.equal(core.verifiedOutcomeClaim(applications[0]), 'Admitted to Stanford, Class of 2028');
assert.equal(core.verifiedOutcomeClaim({ ...applications[0], verificationStatus: 'reviewing' }), null);
assert.doesNotMatch(core.verifiedOutcomeClaim(applications[0]), /essay|got me in|guarantee/i);

assert.deepEqual(core.listingFilterCounts(applications), { all: 4, published: 1, review: 1, draft: 2 });
assert.deepEqual(
  core.applicationsForFilter(applications, 'published')[0].listings.map((item) => item.id),
  ['listing-published'],
);
assert.deepEqual(
  core.applicationsForFilter(applications, 'draft')[0].listings.map((item) => item.id),
  ['listing-draft', 'listing-rejected'],
);

assert.equal(core.isSafeLocalLogoPath('/university-logos/stanford.svg'), true);
assert.equal(core.isSafeLocalLogoPath('/mockup-assets/university-logos/stanford.svg'), false);
assert.equal(core.isSafeLocalLogoPath('https://commons.wikimedia.org/stanford.svg'), false);
assert.equal(core.isSafeLocalLogoPath('//cdn.example.com/stanford.svg'), false);

assert.equal(core.listingStatusLabel('removed'), 'Taken down');
assert.equal(core.listingActionLabel('rejected'), 'Fix and resubmit');

console.log('seller applications core tests passed');
