import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const proofSource = fs.readFileSync(new URL('../lib/admitProof.ts', import.meta.url), 'utf8');
const proofJs = ts.transpileModule(proofSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const proof = await import(`data:text/javascript;base64,${Buffer.from(proofJs).toString('base64')}`);

assert.deepEqual(
  proof.listingProofKeys('["Stanford University", "UC Berkeley"]', 'Stanford'),
  ['stanford', 'uc berkeley'],
);
assert.deepEqual(proof.listingProofKeys('not-json', 'University of Washington'), ['washington']);
assert.deepEqual(proof.listingProofKeys('[]', null), []);
assert.deepEqual(
  proof.listingAdmissionClaims('["Stanford University", "Stanford"]', null),
  [{ schoolKey: 'stanford', schoolLabel: 'Stanford University' }],
);
assert.equal(proof.resolvedProofStatus(true, null), 'verified');
assert.equal(proof.resolvedProofStatus(false, null), 'missing');
assert.equal(
  proof.isAdminApprovedListing({ status: 'approved', humanReviewedAt: '2026-08-31', aiDecision: 'approved' }),
  true,
);
assert.equal(
  proof.isAdminApprovedListing({ status: 'approved', humanReviewedAt: null, aiDecision: null }),
  true,
  'legacy approvals predate humanReviewedAt',
);
assert.equal(
  proof.isAdminApprovedListing({ status: 'approved', humanReviewedAt: null, aiDecision: 'approved' }),
  false,
  'AI-only approval must not verify the seller',
);
assert.deepEqual(
  proof.verifiedAdmissionTags(true, ['Stanford', 'Yale'], []),
  ['Stanford', 'Yale'],
  'admin-approved legacy listings must not need proof rows',
);
assert.deepEqual(
  proof.verifiedAdmissionTags(false, ['Stanford', 'Yale'], ['stanford']),
  ['Stanford'],
  'pending listings must remain proof-based',
);

const runner = fs.readFileSync(new URL('../lib/reviewRunner.ts', import.meta.url), 'utf8');
assert.match(runner, /schoolKey:\s*\{\s*in:\s*proofKeys\s*\}/, 'review must load only listing proof keys');
assert.doesNotMatch(
  runner,
  /where:\s*\{\s*sellerId:\s*listing\.sellerId\s*\}\s*,\s*select:\s*\{\s*id:/,
  'review must not load every proof owned by the seller',
);

const upload = fs.readFileSync(new URL('../lib/admitProofUpload.ts', import.meta.url), 'utf8');
for (const field of ['aiCheckedAt', 'aiGenuine', 'aiNote']) {
  assert.match(upload, new RegExp(`${field}:\\s*null`), `re-upload must clear ${field}`);
}
assert.match(upload, /relatedListingIds/, 're-upload must requeue only related pending listings');

const publicListings = fs.readFileSync(new URL('../app/api/listings/route.ts', import.meta.url), 'utf8');
assert.match(
  publicListings,
  /verifiedAdmitTags:\s*verifiedAdmissionTags\([\s\S]*adminApprovedSellerIds\.has\(l\.sellerId\)/,
  'buyer-visible verification must inherit the admin-approved listing status',
);
assert.doesNotMatch(
  publicListings,
  /admitProofs:\s*\{\s*where:\s*\{\s*status:\s*'verified'/,
  'approved public listings must not require a second proof record',
);

const listingDecision = fs.readFileSync(new URL('../lib/listingDecision.ts', import.meta.url), 'utf8');
assert.match(listingDecision, /decision === 'approved' && opts\.human/, 'only admin approval should trigger seller-wide verification');
assert.match(listingDecision, /admitProof\.createMany/, 'approval must create missing legacy proof rows');
assert.match(listingDecision, /admitProof\.updateMany/, 'approval must verify every seller proof');
assert.match(listingDecision, /verificationDecision\.createMany/, 'automatic verification must remain auditable');

console.log('verification flow tests passed');
