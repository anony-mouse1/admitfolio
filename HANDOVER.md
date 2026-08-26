# Handover: remove seller verification UI

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/remove-seller-verification`

Base: `origin/main` at `41a39c4`.

Worktree: `/private/tmp/admitfolio-remove-verification`

The main worktree had unrelated uncommitted changes, so this work was isolated
and did not alter them.

## What changed

- Removed the Admission verification section from the seller dashboard.
- Removed verification status pills and start or upload verification buttons
  from the application library.
- Removed the now-unused seller proof fetch, upload state, and dashboard event
  handlers.
- Simplified shared application details to decision, class year, and school.
- Kept the underlying admission-proof records, APIs, admin review, and proof
  requirements during listing submission unchanged.

## Database and production changes

There is no migration, backfill, or production data write. The change is UI and
client code only. Deploying `main` makes the simplified dashboard live.

## Verification

- `npm run lint`
- `npm run test:seller-applications`
- `npm run test:seller-verification`
- `npm run test:seller-profile`
- Direct Next.js production build with a build-only session secret and without
  running `prisma migrate deploy`
- Visible localhost mock-up showing the profile, performance, and applications
  flowing together without a verification section
- `git diff --check`

## What is left

- Verify that the Vercel production deployment is Ready and that
  `https://admitfolio.com/api/version` returns the final commit.
- No manual database or backfill step is required.
