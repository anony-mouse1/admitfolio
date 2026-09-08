# Handover: enable abandoned-checkout recovery

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/enable-checkout-recovery`, merged forward through `origin/main`
at `52daae0` (PR #86).

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
- PR #86's school-resolution fixes were merged forward unchanged while
  resolving the handover-file conflict.

No payment, database, migration, or backfill code changed.

## Verification completed

- `npx tsc --noEmit` passed before the merge-forward.
- `npm run test:checkout-recovery` passed.
- `npm run test:launch-hardening` passed.
- `git diff --check` passed.
- `npx next build` passed with placeholder build-only environment values. The
  migration-running `npm run build` command was not used.
- Stripe Checkout settings show that the Promotional Email Terms are accepted.
- The active production webhook endpoint includes
  `checkout.session.expired` among its five subscribed events.

## What is left

1. Re-run the focused checks after the merge-forward, then push the updated PR.
2. Merge PR #85 with Fatimah's repository-owner override.
3. Confirm the new privacy disclosure is live.
4. Add `STRIPE_CHECKOUT_RECOVERY_ENABLED=1` to Vercel production and redeploy
   the current `main` commit so the setting is loaded.
5. Confirm live checkout opens successfully with recovery enabled. Do not
   submit a payment.

## Found but not fixed

- `Purchase Completed` uses the full listing headline for its `school` field,
  while the three earlier browser funnel events use the short school name. This
  can split the final funnel stage into different school groupings. It is
  unrelated to checkout recovery and remains unchanged.
- Duke Kunshan College still resolves to Duke. PR #86 deliberately left that
  existing issue for a separate product decision.

## Environment

`DATABASE_URL` and the other application credentials point at production.
Local development is not a sandbox. Do not run database writes, migrations, or
approval flows during verification.
