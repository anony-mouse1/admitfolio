# Handover: Ritvik seller-flow fixes

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/ritvik-seller-flow`

Implementation commit: `56a9c11`.

GitHub `main` was fast-forwarded from `f95cfa7` to `56a9c11`.

Worktree: `/private/tmp/admitfolio-ritvik-fixes`

The main worktree had unrelated uncommitted changes, so this work was isolated
in a separate worktree and did not alter them.

## Why this change

Ritvik reported that seller onboarding lost form state, repeated the whole form
for each school, tied account creation to essay submission, and allowed another
account flow for an existing email. He also identified weak listing and
verification workflows and prototype university-logo handling.

The persistent checklist is `docs/ritvik-seller-flow-tasks.md`.

## What changed

- Added account-first seller signup. Normalized duplicate emails are rejected
  and routed to login or password recovery. Signup never updates an existing
  seller, and email action tokens are purpose-scoped and single-use.
- Added resumable application drafts with revision-safe autosave, staged private
  uploads, stable asset IDs, restore after a new session, and idempotent final
  submission.
- Added a dashboard Applications workspace that groups reusable school details
  while preserving each listing as the purchase unit and keeping anonymity per
  listing.
- Added safe revision drafts for rejected or removed listings. Existing
  purchased listings and finalized assets are never edited in place.
- Added versioned admission proofs, immutable AI review runs, human decision
  history, and seller-visible verification states. Missing or rejected proofs
  can be uploaded from the dashboard.
- Replaced runtime university-logo URLs with 75 self-hosted assets and a shared
  centered logo component. Unsupported schools use a monogram fallback.
- Added a non-destructive 30-day draft-retention endpoint. It only marks stale
  drafts as recoverable `abandoned` records and is not scheduled yet.

## Database changes

Two migrations were applied automatically by the successful Vercel production
build:

- `20260824090000_seller_signup_security`
- `20260824110000_seller_drafts_verification`

No legacy backfill or destructive cleanup was included.

The read-only production impact report is
`docs/seller-flow-production-impact.md`. At the time of the report it found no
normalized-email collisions. It also recorded legacy proof and listing gaps so
deployment review does not silently infer or overwrite historical data.

## Verification

- Prisma schema validation
- `npx tsc --noEmit`
- Seller auth, profile, draft, retention, revision, Applications,
  verification-flow, and logo tests
- Existing commerce, checkout, school, fulfillment, payout, bank-payout,
  dashboard, Stripe-fee, payout-sandbox, opening-line, analytics, and sale-alert
  tests
- Production `next build` with build-only placeholder database and session
  values, without running migrations
- Browser checks at 1440px and 390px. The integrated dashboard had no horizontal
  overflow and loaded the self-hosted Stanford and Berkeley marks.

All checks passed.

## Production verification

- GitHub `main` resolved to `56a9c11` after the approved push.
- Vercel marked the production deployment Ready.
- `https://admitfolio.com/api/version` returned the full `56a9c11` commit.
- The production homepage and public listings API returned 200.
- The successful Vercel build ran `prisma migrate deploy` before `next build`,
  so both included migrations completed before the new version became live.

## What is left

No required implementation or deployment work remains. The non-destructive
draft-retention endpoint remains deliberately unscheduled. Run no legacy
verification or class-year backfill unless it is separately reviewed and
explicitly approved.
