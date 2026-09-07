# Handover: enable abandoned-checkout recovery

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/enable-checkout-recovery`, based on `origin/main` at `14d0026`
(PR #84 merged).

## Why

The abandoned-checkout pipeline already exists, but production keeps it off
unless `STRIPE_CHECKOUT_RECOVERY_ENABLED=1`. Fatimah explicitly authorized
accepting Stripe's promotional-email terms, adding the required privacy
disclosure, enabling the production flag, redeploying, and verifying checkout
without submitting a payment.

## What changed

- `app/privacy/page.tsx` now explains what Stripe records when someone starts
  but does not finish checkout, that reminder emails require affirmative
  consent, and how to opt out.
- Stripe's Promotional Email Terms were accepted in the live Admitfolio Stripe
  account. This was a hand-run Dashboard action.
- The live Stripe webhook was inspected and already subscribes to
  `checkout.session.expired`, so no webhook configuration changed.

No payment, database, migration, or backfill code changed.

## Verification completed

- `npx tsc --noEmit` passed.
- `npm run test:checkout-recovery` passed.
- `npm run test:launch-hardening` passed.
- `git diff --check` passed.
- `npx next build` passed with placeholder build-only environment values. The
  migration-running `npm run build` command was not used.
- Stripe Checkout settings show that the Promotional Email Terms are accepted.
- The active production webhook endpoint includes
  `checkout.session.expired` among its five subscribed events.

## What is left

1. Merge this disclosure into `main` and wait for the production deployment.
2. Confirm the new privacy disclosure is live.
3. Add `STRIPE_CHECKOUT_RECOVERY_ENABLED=1` to Vercel production and redeploy
   the current `main` commit so the setting is loaded.
4. Confirm live checkout opens successfully with recovery enabled. Do not
   submit a payment.

## Found but not fixed

- PR #84's `Purchase Completed` event uses the full listing headline for its
  `school` field, while the three earlier browser funnel events use the short
  school name. This can split the final funnel stage into different school
  groupings. It is unrelated to checkout recovery and remains unchanged.

## Environment

`DATABASE_URL` and the other application credentials point at production.
Local development is not a sandbox. Do not run database writes, migrations, or
approval flows during verification.
