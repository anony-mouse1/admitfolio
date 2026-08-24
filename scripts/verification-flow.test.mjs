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
assert.match(publicListings, /status:\s*'verified'/, 'buyer-visible verification must require an approved proof');
assert.match(publicListings, /verifiedAdmitTags:\s*admitTags\.filter/, 'only verified outcomes may be returned as verified claims');

console.log('verification flow tests passed');
