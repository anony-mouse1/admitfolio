# Handover: launch catalogue, protected delivery, and seller payouts

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `browse-redesign-and-opening-lines`

Base: `origin/main` at `967a720`

The branch combines the approved browse redesign and listing-school root fix
with the payment, delivery, and seller-payout work requested on 2026-08-17.
Mockups under `public/` remain ignored and are not part of the deployment.

## What changed

- Listing titles now come from the listing's confirmed target school instead of
  the seller's current university. New submissions require a target, ambiguous
  old listings stay off Browse, and admin can confirm the correct school.
- The catalogue, detail sheet, admin, seller dashboard, checkout, and receipts
  share the same school and listing identity.
- Pricing and purchase accounting use a 60% seller / 40% Admitfolio split.
  Each paid purchase stores immutable gross, seller, platform, currency, and
  Stripe identifiers instead of recomputing historical earnings later.
- Checkout accepts only complete approved listings. The webhook upserts by
  Checkout Session, validates the paid snapshot, and retries failed protected
  delivery without creating a second purchase.
- Buyer copies use a non-reversible fingerprint code. The protected reader
  deters copy, paste, print, and download, records a hashed delivery-IP signal,
  and routes receipt replies to `hello@admitfolio.com`.
- A seller becomes eligible for Stripe Connect only after the first real sale.
  The first-sale email and seller dashboard show the exact unpaid amount and a
  single Stripe-hosted setup button. Admitfolio does not collect or store the
  seller's SSN or bank details.
- Once Stripe marks the connected account ready, delivered sales transfer the
  stored seller amount with leases and idempotency keys. Refunds and lost
  disputes reverse the corresponding seller share, including partial refunds.
- Seller earnings count live Stripe sessions only and subtract transfer
  reversals.

## Verification completed

- `npx prisma format`
- `npx prisma generate`
- `npx tsc --noEmit`
- `npm run test:seller-payouts`
- `npm run test:commerce`
- `npm run test:purchase-fulfillment`
- `node scripts/pricing.test.mjs`
- `node scripts/listing-school.test.mjs`
- `git diff --check`
- Direct `npx next build` with temporary build-only `SESSION_SECRET` and
  `NEXT_PUBLIC_LAUNCH=1`. Do not use `npm run build` locally because it runs
  migrations against the live database.

The six pending migrations were inspected and are additive. The Vercel preview
build applied them because Preview uses the live database. A read-only
`prisma migrate status` after the preview completed reports that the production
schema is up to date. No data backfill was run.

## Production rollout still required

Vercel production currently does not show `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, or `STRIPE_CONNECT_WEBHOOK_SECRET`. The local Stripe
secret is a placeholder and cannot be used to configure the live account.

Before merging to `main`:

1. Sign into the Stripe dashboard.
2. Add the live Stripe secret and the two webhook signing secrets to Vercel
   production.
3. Subscribe `/api/stripe-webhook` to `checkout.session.completed`,
   `charge.refunded`, and `charge.dispute.closed`.
4. Create a Connect webhook for `/api/stripe-connect-webhook`, subscribed to
   connected-account `account.updated` events.
5. Confirm the Stripe platform account is activated for Connect and transfers.

After merge, Vercel should find the migrations already applied. Monitor that
deployment and confirm the new unauthenticated seller payout routes return 401.
Do not click a real checkout or create a real transfer as a smoke test.

## Manual work not performed

- No production backfill was run. `scripts/backfill-target-schools.mjs` and
  `scripts/extract-opening-lines.mjs` are dry-run by default and require
  separate approval before `--confirm` writes to the live database.
- No real purchase, seller account, Stripe connected account, payout, refund,
  dispute, or email was created during verification.
- `NEXT_PUBLIC_LAUNCH` was not added to Vercel production. The live site remains
  on its existing pre-launch state unless Fatimah explicitly chooses to launch
  the public catalogue.
