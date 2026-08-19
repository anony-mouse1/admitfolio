# Handover: restore every approved legacy listing to Browse

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/restore-approved-catalogue`

Base: `origin/main` at `09bc905` (`Merge admin reviewed workflow fix`)

## Root cause

The old onboarding did ask `Schools you got into with these essays`, but it
stored a multi-school `admitTags` array. It did not ask which one college the
listing itself was for. The separate `targetSchool` question and column first
shipped in `fa6ced7` on 2026-08-17. All 84 active approved listings that were
placed in `Needs school title` predate that field.

Choosing the seller's current university or the first accepted school would be
false for reusable Common App personal statements, UC PIQs, and multi-school
application packages. Approval should be the publication decision, so a missing
legacy field must not hide an otherwise approved listing.

## What changed

- Approved legacy listings now publish under a truthful application title when
  one exact college is not saved: `UC Application`, `Common App Personal
  Statement`, `Common App Essay Package`, `College Application Essay Package`,
  `College Essay`, or `College Essay Package`.
- An explicit `targetSchool`, including every new submission, still wins. A
  legacy listing with only one accepted school still uses that school.
- The public catalogue no longer filters multi-admit legacy listings. Local
  real-data verification now renders all 144 approved listings, up from 59.
- Browse cards, detail sheets, seller dashboard, admin, checkout, Stripe
  metadata, purchase records, approval emails, and the paid reader share the
  same headline resolver.
- The admin `Needs school title` tab is gone. Approved listings stay in
  `Reviewed` and show `Approved and live`. Admin may optionally choose an exact
  college only when every essay in the listing belongs to that school.
- Older pending listings can be approved without fabricating a college title.
- Legacy sellers can still edit prices. Their floor uses the strongest claimed
  admit for pricing only, never as the public title.
- `scripts/infer-legacy-target-schools.mjs` preserves the PDF-heading audit as a
  dry-run tool. It found 16 of 85 multi-school targetless approved records with
  one evidence-backed target; 69 had no safe one-school answer. No backfill was
  written.

## Verification completed

- `npm run test:listing-schools`
- `npm run test:commerce`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npx prisma validate`
- `npx tsc --noEmit`
- Direct `npx next build` with temporary build-only `SESSION_SECRET` and
  `NEXT_PUBLIC_LAUNCH=1`. No migration command was run.
- Visible local Browser QA against production-read data:
  - `Showing 144 of 144 listings`
  - no `Load more` results left after expanding the catalogue
  - no browser console errors
  - a restored Common App legacy listing used the same title on its card,
    detail sheet, and checkout modal
  - admin preview has no `Needs school title` tab and shows an unresolved
    approved listing as `Approved and live`
- The Stripe payment button was not clicked.

## Production rollout completed

PR #30 was merged to `main` as `3035723`. Vercel reported success. Live checks
then confirmed:

- `https://admitfolio.com/#browse` reports 144 listings.
- The live admin console has no `Needs school title` tab.
- `Reviewed` contains 143 `Approved and live` cards and no `Confirm approval`
  buttons. The remaining approved listing is on the admin's Saved shelf, which
  does not unpublish it; the public catalogue still contains all 144.
- No live browser console errors were observed.

No migration, database write, backfill, Stripe checkout, or email was needed.

## Optional later cleanup

The 16 PDF-supported exact targets can be reviewed individually and written
with `scripts/infer-legacy-target-schools.mjs --confirm`, but that is not needed
for publication and requires explicit approval because `.env` is production.
