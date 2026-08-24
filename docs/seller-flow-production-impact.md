# Seller-flow production impact report

Generated read-only on 2026-08-24 at 11:16 AM Pacific. No production rows were changed.

## Email identity migration

- Sellers: 154
- Case-insensitive normalized-email collisions: 0
- Result: the lowercase unique index can apply without merging accounts.

## Existing admission proofs

- Pending: 138
- Rejected: 1
- Verified: 0
- Proof file present: 129
- Proof file missing: 10
- Existing AI advice: 122
- Existing human decision timestamp: 1

The migration initializes every current proof at version 1. It does not invent
verification decisions for legacy AI fields or mark any proof verified. New AI
runs and human decisions become append-only after deployment.

## Existing listings

- Listings: 254
- Missing `targetSchool`: 230
- Missing class year: 254

No school or class-year backfill is included. The dashboard derives a private
application group from existing safe listing fields, and sellers can correct
shared class-year details themselves. Public anonymity and purchase behavior
remain listing-based.

## Production activation boundary

The two migrations have been reviewed but not applied. The inactive draft
retention endpoint only marks stale drafts abandoned and deletes nothing. It is
not scheduled in `vercel.json`.
