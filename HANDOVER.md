# Handover: checkout attribution

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch `ritvik/checkout-attribution`, PR #92. Merged current `main`, including
PRs #89 and #96, after both branches were reviewed and merged.

## Why

Nine sales and no way to tell which page earned any of them. Vercel Analytics
records the funnel but nothing joins a Stripe payment back to the page that
produced it.

## What changed

- The first page of the session is recorded once per tab and sent to Stripe as
  metadata on the Checkout Session and the PaymentIntent, alongside the page the
  buyer pressed Unlock on.
- Four fields: `landingPage`, `landingReferrer`, `landingUtm`, `checkoutPage`.

## Privacy and trust-boundary pass

The review was right. Two of the four fields were carrying third-party data.

- **`landingReferrer` is now the host and nothing else.** It was host plus path.
  A referrer path is a URL on somebody else's site, and the ones that turn up in
  practice are webmail, shared documents, intranets and private group chats.
  None of that is ours to copy into the Stripe Dashboard.
- **`landingUtm` values are now checked rather than copied.** A value is kept
  only if it is at most 40 characters of lowercase alphanumerics, dot,
  underscore or hyphen, and does not look like one of our signed tokens or like
  an opaque identifier. Anything else becomes `[redacted]`. The KEY survives, so
  a campaign visit is still a campaign visit rather than being refiled as
  organic.
- **`landingPage` and `checkoutPage` are bounded to the shape our routes have.**
  Not part of the review, but a landing page is whatever URL the visitor arrived
  on, and a 404 on our own domain renders inside the root layout where the
  landing is recorded. Anything outside three lowercase kebab segments and 80
  characters becomes `/[other]`.

`looksLikeCredential` is now exported from `lib/redactAnalyticsUrl.ts` and reused
rather than reimplemented.

## What attribution this costs

- **Which thread or article, gone.** "reddit.com sent them" survives; "this
  thread on r/ApplyingToCollege sent them" does not. This is the only real loss.
- **A campaign named with spaces, capitals or punctuation reads `[redacted]`.**
  Campaign names are ours to choose, so this costs nothing as long as they are
  written in the shape above.
- **A campaign name of 16 or more characters drawn only from a-f and 0-9 is
  redacted** as if it were a hex id. Over-redaction in the safe direction.
- **A 404 landing shows as `/[other]`** rather than naming the bad URL.
- Nothing else. Channel, medium, campaign, landing page and checkout page all
  still answer the question the feature exists for.

The checkout API sanitizes the four fields again instead of trusting the
browser. Unknown pages become `/[other]`, referrers are reduced to a hostname,
and UTM values outside the narrow allowlist become `[redacted]`. The privacy
policy now discloses the collection and the Stripe transfer.

## Verification

- `npx tsc --noEmit` clean, all pure `scripts/*.test.mjs` tests pass.
- Every new rule was checked by breaking what it guards: restoring the referrer
  path, passing utm values through raw, dropping a redacted key instead of
  keeping it, and removing the path bound each failed with their own message.
- The 400 character clamp is now a backstop rather than a margin. Every field is
  bounded at source: a path at 80, a campaign string at 145, a referrer at a
  hostname's own 253. It stays because the value arrives in a request body from
  a browser and an untrusted client must truncate, never fail a purchase.

## What is left

Review and merge. PR #94 still requires a separate claims and conflict review.
No migration, backfill, database write, or hand-run deploy step is required.
