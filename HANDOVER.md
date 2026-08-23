# Handover: Owner sale alerts and conversion tracking

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `main`

Implementation commit: `c55902e`. Merge commit: `66ea4bf`.

Worktree: `/private/tmp/admitfolio-sale-alerts-analytics-fix`

## Why this change

Fatimah asked to receive an email at `hello@admitfolio.com` after every sale
and to repair the missing Vercel `Purchase Completed` conversion event.

The conversion event was emitted before the Stripe fee snapshot was ready.
That request returned 500, so Vercel discarded the event. Stripe's successful
retry skipped it because the buyer delivery was already complete.

## What changed

- Added a privacy-safe owner sale email. It includes the listing, sale amount,
  Admitfolio revenue, Stripe fee, seller payout, and Pacific sale timestamp.
- Excluded buyer and seller contact details from the owner email.
- Defaulted sale alerts to `hello@admitfolio.com`, with an optional
  comma-separated `SALE_NOTIFY_EMAILS` override.
- Added a stable Resend idempotency key per purchase and recipient so webhook
  retries cannot send duplicate owner alerts.
- Moved `Purchase Completed` tracking after Stripe fee finalization and into
  the first finalized notification block. A fee-pending first attempt can now
  be completed and tracked by Stripe's retry.
- Kept analytics and owner-email failures non-fatal to delivery and payouts.
- Added a regression test for the recipient fallback, privacy boundary,
  idempotency key, and conversion-event ordering.

## Verification

- `npm run test:sale-alerts`
- `npm run test:analytics`
- `npm run test:commerce`
- `npm run test:stripe-fees`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npx tsc --noEmit`
- Direct `npx next build` with build-only placeholder environment values. This
  deliberately bypassed the repository build script so no live database
  migration ran.

All checks passed under the bundled Node.js runtime.

## Production verification

- GitHub pull request #55 merged to `main` as `66ea4bf`.
- Vercel marked the production deployment Ready and assigned `admitfolio.com`.
- `https://admitfolio.com/api/version` returned the exact merge commit with 200.
- Deployment runtime logs showed zero warnings, errors, or fatal events. The
  homepage, listings API, version endpoint, and review cron all returned 200.
- No fake purchase or test email was sent. The first genuine sale after this
  deployment is the end-to-end verification for the owner email and Vercel
  conversion event.

## What is left

Nothing remains for this change. No migration, backfill, database write, or
Vercel environment change was required. Historical missed conversion events
were not backfilled.
