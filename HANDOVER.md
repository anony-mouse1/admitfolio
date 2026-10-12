# Handover: live seller repricing

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/reprice-live-listings`

Base: `origin/main` at `2338457`, which is deployed to production and includes
the flexible seller-pricing changes from PR #103.

## What changed

- Added `scripts/reprice-approved-listings.mjs`. It creates a locked pricing
  plan, applies that exact plan transactionally, and verifies the live result.
- The approved temporary formula gives listings with one acceptance 60% off,
  listings with two to four acceptances 55% off, and listings with five or more
  acceptances 50% off. Prices are constrained to $9 through $49 and can never
  increase.
- Updated `scripts/send-seller-pricing-options.mjs` to read the same locked plan
  and privately email each seller their exact old and new prices. The email
  offers four choices: keep the new price, edit it, reply `choose for me`, or
  reply `take it down`.

## Verification completed

- Both scripts pass Node syntax checks and `git diff --check`.
- The plan passed invariant checks: all 190 listings change, no price rises,
  every new price is an integer, and all new prices are between $9 and $49.
- Email dry-run against the locked plan: 114 sellers, 190 approved listings,
  two private Resend batches.

## Locked plan

The private plan is stored outside this worktree at:

`/Users/fatimah/admitly-claude/review-drafts/admitfolio-pricing-reduction-2026-10-11.json`

It is mode `0600` and is not committed because it contains seller emails. It
covers 190 approved listings from 114 sellers. All 190 prices change. The new
distribution is $9 minimum, $22 median, $31 at p75, and $49 maximum.

## Required operational order

1. Merge this branch to `main` and confirm Vercel is Ready.
2. Apply and verify the locked plan with the production `.env`.
3. Send a test email to `hello@admitfolio.com`.
4. Send the two private seller-email batches only after the database verifies.
5. Verify live catalogue prices through the public listings API.

No migration or backfill is required. Do not regenerate the plan after prices
change. Applying the same plan again is safe and reports `already-applied`.
