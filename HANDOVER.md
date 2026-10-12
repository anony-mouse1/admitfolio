# Handover: live seller repricing

Read `AGENTS.md` first. This file records the just-completed production
operation.

## Branch and base

Completion record branch: `codex/repricing-completion-record`

Base: `origin/main` at `d682f1c`, the merge commit for PR #104. Production
continues to serve app commit `2338457`, which contains the flexible pricing UI
from PR #103. PR #104 only changed private operational scripts, so it did not
need a new application build.

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

## Production operation completed

- Both scripts pass Node syntax checks and `git diff --check`.
- The plan passed invariant checks: all 190 listings change, no price rises,
  every new price is an integer, and all new prices are between $9 and $49.
- The locked plan was applied in one database transaction and verified twice.
  Final state: 190 new prices, zero old prices, zero missing listings, and zero
  unexpected values.
- The public `/api/listings` response independently showed 190 priced listings,
  a $9 minimum, $22 median, $31 p75, $49 maximum, and zero prices over $49.
- Resend accepted one test email to `hello@admitfolio.com`.
- Resend then accepted all 114 private seller emails in two batches: 100 and 14.
  The campaign ID is `admitfolio-seller-price-reduction-2026-10-11`.

## Locked plan

The private plan is stored outside this worktree at:

`/Users/fatimah/admitly-claude/review-drafts/admitfolio-pricing-reduction-2026-10-11.json`

It is mode `0600` and is not committed because it contains seller emails. It
covers 190 approved listings from 114 sellers. All 190 prices change. The new
distribution is $9 minimum, $22 median, $31 at p75, and $49 maximum.

## Remaining work

- Monitor replies to `hello@admitfolio.com` for `choose for me` and `take it
  down` requests. Each response requires a separate, seller-specific action.
- Do not resend the campaign unless Fatimah explicitly asks. Resend idempotency
  protects the current batch keys, but changing the campaign constant would
  intentionally create a new send.

No migration or backfill is required. Do not regenerate the plan after prices
change. Applying the same plan again is safe and reports `already-applied`.
