import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/seller/proofs/route.ts', import.meta.url), 'utf8');

assert.match(route, /await currentSeller\(\)/, 'proof status must require an awaited seller session');
assert.match(route, /where:\s*\{\s*email:\s*session\.email\s*\}/, 'proofs must be scoped to the signed-in seller');
assert.doesNotMatch(route, /sellerId:\s*true/, 'the seller proof response must not expose seller IDs');
assert.match(route, /canReplace:\s*status === 'rejected' \|\| !proof\.pdfPath/, 'rejected or missing proof should be uploadable');
assert.match(route, /status === 'rejected' \? proof\.adminNote : null/, 'rejection notes must not leak across states');

const uploadRoute = fs.readFileSync(
  new URL('../app/api/seller/proofs/[id]/upload/route.ts', import.meta.url),
  'utf8',
);
assert.match(uploadRoute, /await currentSeller\(\)/, 'replacement upload must require an awaited seller session');
assert.match(uploadRoute, /id, sellerId:\s*seller\.id/, 'replacement must enforce proof ownership');
assert.match(uploadRoute, /proof\.status !== 'rejected' && proof\.pdfPath/, 'only rejected or missing proofs can be replaced');
assert.match(uploadRoute, /replaceAdmitProofFile\(proof, file\)/, 'replacement must use the shared safe upload path');

const uploadHelper = fs.readFileSync(new URL('../lib/admitProofUpload.ts', import.meta.url), 'utf8');
assert.match(uploadHelper, /v\$\{nextVersion\}\.pdf/, 'each proof version must use an immutable storage path');
assert.match(uploadHelper, /version:\s*nextVersion/, 'replacement must increment the proof version');

const reviewRunner = fs.readFileSync(new URL('../lib/reviewRunner.ts', import.meta.url), 'utf8');
assert.match(reviewRunner, /verificationRun\.create/, 'AI checks must append a verification run');
assert.match(reviewRunner, /proofVersion:\s*reviewedProof\.version/, 'AI checks must target the version they read');
assert.match(reviewRunner, /verificationDecision\.create/, 'AI advice must append a decision record');

const adminDecision = fs.readFileSync(new URL('../app/api/admin/admit-proof/route.ts', import.meta.url), 'utf8');
assert.match(adminDecision, /actorId:\s*admin\.email/, 'human proof decisions must record the admin identity');
assert.match(adminDecision, /proofVersion:\s*proof\.version/, 'human decisions must target one proof version');

console.log('seller verification tests passed');
