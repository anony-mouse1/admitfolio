# Handover: conversion analytics and internal-traffic filtering

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/analytics-conversion-events`

Base: `origin/main` at `b3c438b` (includes PR #48 Stripe-fee accounting).

Worktree: `/private/tmp/admitfolio-conversion-events`

## Why this change

Vercel Web Analytics was collecting page views, but it included production
admin activity and had no conversion events. Fatimah asked for a clean view of
real visitor behavior and the buyer and seller funnels.

## What changed

- Analytics and Speed Insights now report only `admitfolio.com` and
  `www.admitfolio.com`. Localhost and Vercel preview hosts are excluded.
- `/admin` and every child route are excluded. Visiting an admin route also
  marks that browser as internal so later public-site testing is excluded.
- Team devices that do not visit the admin can opt out with `/?internal=1`.
  `/?internal=0` clears the local opt-out. The control visits are not reported.
- Existing purchase-token and query-value redaction remains in place.
- Added these privacy-safe custom events:
  - `Browse Opened`
  - `Listing Viewed` with school and listing type
  - `Checkout Started` with school and price
  - `Purchase Completed` with school and price, emitted only after protected
    buyer delivery succeeds
  - `Match Search` with result count and whether a budget was supplied
  - `Seller Signup Started`
  - `Seller Email Verified`
  - `Seller Listing Submitted` with essay count and pricing mode
- No event contains an email, listing ID, search text, seller ID, Stripe session
  ID, purchase ID, or reading token.
- Added a focused policy regression test and `npm run test:analytics`.

## Verification

- Vercel team is on Pro, which supports custom events.
- `npm run test:analytics`
- `npm run test:commerce`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npx tsc --noEmit`
- Direct `next build` with harmless build-only placeholder values. No migration
  or production write ran.
- Visible local browser QA on port 3004 confirmed browse and seller-signup UI
  still work, produce no console errors, and queue no analytics on localhost.

## What is left

1. Push and open a PR.
2. Merge to `main`, wait for Vercel production to become ready, then perform one
   non-financial live event check. Never complete a payment during QA.
3. Historical admin traffic cannot be deleted from the existing dashboard.
   Filtering applies to new events after deployment.

No database migration, backfill, Vercel environment variable, or paid add-on is
required.

## Unrelated workspace state

The main workspace has pre-existing edits and untracked files. This work lives
in a clean worktree and does not modify or stage any of those files.
