import assert from 'node:assert/strict';
import fs from 'node:fs';

// The seller-facing revise path is gone. A rejected or taken down listing is
// final, and a seller who needs a change emails support. What this file guards
// is that the route stays gone and that its removal did not strand anything.

const revisionRoute = new URL('../app/api/seller/listings/[id]/revision/route.ts', import.meta.url);
assert.equal(
  fs.existsSync(revisionRoute),
  false,
  'the seller-facing revision route must stay removed; a rejected listing is final',
);

const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(page, /\/revision/, 'nothing may call the revision route');

const workspace = fs.readFileSync(new URL('../components/seller/SellerApplicationsWorkspace.tsx', import.meta.url), 'utf8');
assert.match(workspace, /function isFinal/, 'rejected and taken down listings must be recognised as terminal');
assert.match(workspace, /Email us about this listing/, 'a final listing must offer the route that does work');
assert.match(workspace, /!isFinal\(listing\.status\) && \(/, 'a final listing must not render an action button that does nothing');

// Drafts created before the route went still carry a sourceListingId and must
// still be able to finish through the ordinary submit path.
const finalize = fs.readFileSync(new URL('../app/api/seller/drafts/[id]/finalize/route.ts', import.meta.url), 'utf8');
assert.match(finalize, /draft\.sourceListing\?\.essays\.find/, 'in-flight revision drafts must still finalize');
assert.match(finalize, /sourceListingId \? \{ not: draft\.sourceListingId \}/, 'a revision draft must not collide with its own source listing');

const status = fs.readFileSync(new URL('../app/api/seller/listing-status/route.ts', import.meta.url), 'utf8');
assert.doesNotMatch(status, /action === 'resubmit'/, 'status endpoint must not resubmit old buyer assets in place');

const migration = fs.readFileSync(new URL('../prisma/migrations/20260824110000_seller_drafts_verification/migration.sql', import.meta.url), 'utf8');
assert.match(migration, /"sourceListingId" TEXT/, 'the revision source column stays; existing rows reference it');
assert.match(migration, /SellerApplicationDraft_sourceListingId_fkey/, 'revision source must stay foreign-keyed');

console.log('seller revision removal checks passed');
