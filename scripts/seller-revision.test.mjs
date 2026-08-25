import assert from 'node:assert/strict';
import fs from 'node:fs';

const revision = fs.readFileSync(new URL('../app/api/seller/listings/[id]/revision/route.ts', import.meta.url), 'utf8');
assert.match(revision, /authenticatedSeller\(\)/, 'revision creation must require seller authentication');
assert.match(revision, /id, sellerId:\s*seller\.id/, 'revision creation must enforce listing ownership');
assert.match(revision, /\['rejected', 'removed'\]/, 'only rejected and removed listings can become revision drafts');
assert.match(revision, /sourceListingId:\s*listing\.id/, 'a revision must retain its immutable source listing');
assert.match(revision, /sourceEssayId:\s*essay\.id/, 'unchanged files must reference the purchased source essay');

const status = fs.readFileSync(new URL('../app/api/seller/listing-status/route.ts', import.meta.url), 'utf8');
assert.doesNotMatch(status, /action === 'resubmit'/, 'status endpoint must not resubmit old buyer assets in place');

const migration = fs.readFileSync(new URL('../prisma/migrations/20260824110000_seller_drafts_verification/migration.sql', import.meta.url), 'utf8');
assert.match(migration, /"sourceListingId" TEXT/, 'migration must persist the revision source');
assert.match(migration, /SellerApplicationDraft_sourceListingId_fkey/, 'revision source must be foreign-keyed');

console.log('seller revision safety checks passed');
