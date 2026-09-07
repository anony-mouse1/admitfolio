# Handover: checkout stage events

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/checkout-stage-events`, on `origin/main` at `9cffdf1` (#83).
Open as PR #84 against `main`, not merged. Nothing else is in flight.

## Why

Checkout Started fires at the unlock click, before the delivery email field
exists, and both checkout stages share `/?checkout=<id>`. Everyone who starts
and leaves is one group. Two events split that group into the email stage and
the payment stage. This is recommendation 2 of the buyer acquisition audit, and
Fatimah approved working the audit in order.

## What changed

Five files, plus this one.

- `lib/analyticsEventNames.ts`: `checkoutEmailSubmitted` ("Checkout Email
  Submitted") and `checkoutPaymentLoaded` ("Checkout Payment Loaded"), inserted
  in funnel order after Checkout Started.
- `scripts/analytics-policy.test.mjs`: the ordered name list gains both names in
  the same position. The assertion itself is unchanged.
- `app/page.tsx`: `confirmBuyDeliveryEmail` fires Checkout Email Submitted after
  validation passes and before `setBuyEmailConfirmed(true)`, with `school` and
  `value` from `curItem`, never the address. The `EmbeddedListingCheckout` mount
  passes `school` and `price` as two new props. Nothing else in the file moved.
- `components/EmbeddedListingCheckout.tsx`: fires Checkout Payment Loaded once
  both Stripe's iframe is inside the wrapper (a MutationObserver on the wrapper
  div) and `/api/checkout` has returned a client secret. Both facts live in one
  ref, and whichever arrives second reports. Measured locally: Stripe.js
  attaches its iframe about five milliseconds after the POST starts and more
  than a second before the 200 comes back, so the iframe alone would count
  sessions that never existed. A failed POST never sets the secret flag, so it
  never fires.
- `lib/analyticsEvents.ts`: when the policy silences an event, development
  builds log it to the console as `[analytics:dev] not sent from this host:
  <name> <json>`. Production builds drop the branch and the built chunks contain
  no such string. It exists only so the checkout flow can be walked locally.

Not touched: the abandoned cart recovery pipeline,
`STRIPE_CHECKOUT_RECOVERY_ENABLED`, Purchase Completed, anything under
`prisma/`, any dependency.

## Decisions already made, do not reopen

- The Change button on step 2 lets a buyer resubmit the email. That fires
  Checkout Email Submitted again and, because the component remounts with a new
  Stripe session, Checkout Payment Loaded again. Ritvik decided to let it: the
  visitors column in Vercel dedupes. No ref suppresses it.
- The names were proposed and chosen before implementation: a Checkout prefix
  so the funnel sorts together in Vercel, past participles like the existing
  names, and no React jargon such as "mounted".

## Verification completed

- `npx tsc --noEmit` clean.
- All 27 `test:*` scripts pass, including `test:analytics`.
- `npx next build` succeeds. Never `npm run build`; it applies migrations.
- Local walk-through on `npx next dev -p 3000` with Stripe test keys and a
  synthetic address, payment never completed. An in-page timeline (a `fetch`
  wrapper plus a body MutationObserver) ordered every event against the POST.
  Per stage, exactly once: Checkout Started at the unlock click; Checkout Email
  Submitted on Continue; Checkout Payment Loaded one millisecond after the 200
  and after the iframe. Change then Continue re-fired both once. With the
  per-IP throttle tripped by malformed POSTs from the shell (those return 400
  before touching Stripe or the database), the browser's POST got 429, the
  error rendered in both places, and no payment event fired.
- No database write, migration, backfill or script. The only reads were the
  ones the app itself makes on `/api/listings` and `/api/checkout`.

## What is left, and whose it is

1. **Fatimah: review and merge PR #84.** `git push` does not deploy; Vercel
   deploys `main`.
2. **After deploy, confirm in Vercel Analytics** that `Checkout Email Submitted`
   and `Checkout Payment Loaded` appear in the events list. Neither can be seen
   from localhost or a preview, because `lib/analyticsPolicy.ts` allows only
   `admitfolio.com` and `www.admitfolio.com`. Expect both to sit between
   Checkout Started and Purchase Completed, and within a few of each other
   unless session creation is failing.
3. No hand-run step. No migration, no backfill.

## Found but not fixed

- **Purchase Completed sends the full listing headline as `school`**
  (`app/api/stripe-webhook/route.ts`), while every client event sends
  `schoolShortName`. The last funnel step will not group with the first three
  until that is aligned. Reported in the PR, out of scope here.
- **Stripe's `onAnalyticsEvent` for Embedded Checkout is a private preview.**
  `@stripe/stripe-js` 9.13 types it and react-stripe-js 6.8 forwards options to
  `createEmbeddedCheckoutPage` unchanged, but no event of any kind reached a
  handler on this account, and Stripe's documentation page for the feature
  says to request access. If the account is enrolled, the payment event could
  move to Stripe's `checkoutRendered`.
- **Next 16.3's dev server appends a generated block to `AGENTS.md`** on every
  `npx next dev` start, with a comment inviting you to commit it. It was
  reverted with `git checkout -- AGENTS.md` before committing and is not on
  this branch. `agentRules: false` in `next.config.js` stops it. That is
  Fatimah's call, since `AGENTS.md` is the rules file for both tools. Check
  `git status` for it before any commit made after running the dev server.
- The Vercel Analytics client logs "Page view would be ignored by
  `beforeSend`" in development. Expected: the policy returns null off the
  production hosts.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. `next dev` and `next start` read `.env.local`, so both run against
production data with Stripe test keys. Ritvik's uncommitted `.gitignore` change
(adding `.impeccable/` and `CLAUDE.local.md`) is his, not part of this branch,
and was left unstaged.
