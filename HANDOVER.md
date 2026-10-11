# Handover: optional seller pricing

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/remove-price-minimum`

Base: `origin/main` at `a18fce4`.

## What changed

- Removed school-based minimum prices from both listing submission paths and
  the seller dashboard price editor.
- Sellers may now choose any whole-dollar amount from $1 to the existing caps.
- Added optional package recommendations based only on essay count: $15 for one
  essay, $19 for two or three, $24 for four to six, and $29 for seven or more.
- Replaced the seller-facing tier and floor language with recommendation copy.
- Updated the Terms to say sellers choose their own prices.
- Added `scripts/send-seller-pricing-options.mjs`. It creates one private,
  personalized email per seller with current and suggested prices and four
  choices: keep the current price, edit it, reply `choose for me`, or reply
  `take it down`.

## Verification completed

- `node scripts/pricing.test.mjs`
- `node scripts/seller-listing-filters.test.mjs`
- `node scripts/verify-inline-controls.mjs`
- `npm run test:commerce`
- `npm run test:listing-schools`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npm run test:analytics`
- `npx tsc --noEmit`
- Direct `npx next build` with production variables loaded, without running
  `prisma migrate deploy`.
- Email dry-run against production data: 114 sellers, 190 approved listings,
  two Resend batches. No seller email was sent during the dry-run.

## Production status

Nothing is deployed and no seller prices were changed. Merge this branch into
`main`, wait for Vercel to become Ready, and verify the live seller price editor
before sending the seller email campaign.

The campaign command is:

`node --env-file=.env scripts/send-seller-pricing-options.mjs --send`

Run a single test to `hello@admitfolio.com` first with `--test
--test-email=hello@admitfolio.com`, then verify receipt in the Admitfolio inbox.
The email is idempotent at the Resend batch level, but do not change the
campaign constant and rerun `--send` unless a resend is intentional.

No migration or database backfill is required. Existing listing prices remain
unchanged until a seller edits them or explicitly replies `choose for me`.
