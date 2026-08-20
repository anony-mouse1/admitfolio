# Handover: embedded listing checkout

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/embedded-listing-checkout`

Base: `origin/main` at `57c404e` after the final rebase.

Worktree: `/private/tmp/admitfolio-embedded-checkout`

## Why this change

Listing unlocks currently send buyers to a Stripe-hosted page. Fatimah approved
an embedded checkout mock and asked for the real payment form to stay inside the
Admitfolio listing flow on desktop and phone.

## What changed

- Added Stripe's React and browser SDK packages.
- Added `EmbeddedListingCheckout`, which mounts Stripe Embedded Checkout and
  requests one client secret for the selected listing.
- Kept the unit of purchase as a listing and preserved the existing server-side
  validation, price quote, metadata, 60/40 accounting and fulfillment.
- Changed Checkout Session creation from a hosted URL to `embedded_page` mode.
  The session returns through `/purchase/success` after completion.
- Kept `payment_method_types` omitted so Stripe's dynamic payment methods can
  show real Link, Apple Pay and card options when the buyer and device qualify.
- Changed `/api/checkout` to return the Stripe client secret instead of an
  external checkout URL.
- Replaced the confirmation-only modal with a responsive order summary and
  embedded payment layout. On mobile it becomes a single-column checkout sheet.
- Added the approved polished Stripe frame with a secure-payment header,
  rounded container, subtle background treatment and Stripe branding.
- Documented the required browser-safe Stripe publishable key in `.env.example`.
- Added a focused embedded-checkout wiring test and extended the commerce test
  to lock the embedded Session contract.

Card data never enters Admitfolio's React state or servers. Stripe renders the
payment fields in its own secure embedded frame. Stripe may still temporarily
send a buyer to a bank or wallet for authentication, then return them to
Admitfolio.

## Verification

- The approved static checkout mock was shown in the visible Codex side browser.
- The iPhone wrapper was shown and checked without horizontal overflow.
- The mock includes Stripe-style Link and Apple Pay express options plus card.
- `npm run test:embedded-checkout`
- `npm run test:commerce`
- `npx tsc --noEmit`

After the final rebase, rerun the focused checkout, commerce, fulfillment,
seller-payout and TypeScript checks. Run direct `npx next build` with harmless
build-only placeholder values. Do not run migrations.

## Vercel configuration completed

With Fatimah's action-time approval, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` was
added twice in Vercel. The Stripe test publishable key is scoped to Preview and
the Stripe live publishable key is scoped to Production. Vercel already had
separate Preview and Production `STRIPE_SECRET_KEY` entries. The key values were
never printed, saved locally, added to source control or written into this file.

## What is left

1. Push this branch, then verify the Vercel Preview with test-mode Stripe.
2. Confirm Stripe renders eligible Link, Apple Pay and card options. Create an
   unpaid Checkout Session only. Never complete a payment during QA.
3. Merge only after the preview and phone experience are approved.
4. After merge, verify the live listing modal and Stripe webhook behavior.

No database migration or backfill is needed.

## Unrelated workspace state

The main workspace has pre-existing edits for browse cards, payout sandbox work,
reader work, logos and vendor assets. Do not stage, revert or merge those files
as part of this branch. The static checkout and phone mockups are untracked in
the main workspace and are not part of the production change.
