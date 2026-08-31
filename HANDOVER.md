# Handover: admin approval verifies seller admissions

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/auto-verify-acceptance`

Base: `origin/main` at `d2b1f14` (`Smooth the checkout page transition`).

## What changed

- Admin approval of any seller listing is now the final admission-verification
  decision for that seller.
- The approval transaction creates missing acceptance-proof rows for all schools
  the seller has claimed, marks every proof row verified, clears obsolete
  rejection notes, and appends auditable admin decision records.
- The approving admin email is attached to those automatic decisions.
- Existing admin-approved sellers are treated as verified immediately on public,
  seller-profile, seller-proof, and admin-console reads even when they never had
  an acceptance-letter row. This avoids a production backfill.
- Seller-wide verification applies to legacy admin approvals and current human
  approvals. A purely automated essay-review approval does not grant it.
- No visible UI layout or copy changed. Approved proof rows simply resolve to
  the existing verified state, so no new mock-up was needed.

## Verification completed

- `npm run test:verification-flow`
- `npm run test:seller-verification`
- `npm run test:seller-applications`
- `npm run test:seller-profile`
- `npm run test:launch-hardening`
- `npm run test:listing-schools`
- `npm run test:opening-lines`
- `npx tsc --noEmit`
- Production-mode `next build --webpack` with build-only placeholder values.
- `git diff --check`

## Production status

The change is implemented and verified only on this branch. It has not been
pushed, merged, deployed, or run against the production database. No migration
or hand-run backfill is required. Merge to `main`, wait for Vercel to report
Ready, then verify `/api/version`, one legacy approved seller with no proof row,
and one newly approved seller in the admin console.
