# Handover: bug-fix programme, batch 2 of 6

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/fix-wrong-data-shown`

Base: `ritvik/fix-copy-and-cosmetics` at `0d9818f`, which is open as PR #75 and
itself sits on `origin/main` at `dd48801`.

Batches are stacked rather than opened independently off `main`, because batches
1 to 5 all edit `app/page.tsx`.

## What changed

Every item here was a case of the UI stating something untrue.

- **Pending and unknown money no longer render as `$0.00`.** A purchase whose
  Stripe fee has not settled is counted as a sale but excluded from every
  accounted total, so a seller whose only sale was pending saw "1 sale" beside
  "$0.00". Those figures now read "Pending". Figures the API never sent read
  "Not available".
- **An unknown Stripe fee is null, not zero.** When `/api/seller/listings` omits
  any of the eight accounting fields the client falls back to derived math.
  It used to print a literal `$0.00` Stripe fee, so the breakdown reconciled
  against a number nobody sent. Net earnings had the same defect in reverse: the
  fallback was 60% of gross, which overstates the payout by the entire Stripe
  fee on every checkout that passes it to the seller. Both are now null.
- **Two spellings of one school collapse to one.** `collegeAdmitTags` now
  de-duplicates with `sameSchool`, the same resolver `addAdmit` uses at entry, so
  entry and render finally agree. This fixes the card line and the detail-sheet
  chips at one point. Measured against live data: 5 of 192 listings carry a
  duplicate spelling, 7 duplicate names in total, across Duke, NYU, Penn State,
  Rutgers, UNC Chapel Hill and UPenn. "Penn State" correctly stays separate from
  "University of Pennsylvania".
- **An unpriced listing is called unpriced, not free.** The detail sheet said
  "Free", the card said nothing, and the checkout modal said nothing. All five
  display sites now share one `priceLabel` helper. Unreachable today because
  `/api/listings` filters `packagePrice: { not: null }`, so this is a guard.
- **Prices are whole dollars, within one range.** `packagePrice` and
  `Essay.price` are `Int` columns, so the server rounded 29.50 to 30 silently.
  All four price inputs now carry `step={1}`, a visible "Whole dollars only, no
  cents." hint, and a client-side guard. The wizard capped at 99 per essay and
  399 per package while the dashboard editors had no upper bound at all; both
  now share the same named constants. Accepting real cents would be a schema
  change and is Fatimah's call, so it was not done.
- **`isAdminApprovedListing` is no longer handed a row with its own inputs
  stripped out.** `lib/sellerDashboardView.ts` dropped `humanReviewedAt` and
  `aiDecision` when mapping listings for the client, so the predicate collapsed
  to `status === 'approved'` and every AI-auto-approved listing granted
  seller-wide verification, contradicting the contract at `lib/admitProof.ts:93`.
  The predicate now reads the unmapped Prisma rows, which still carry both
  fields, and the seller-facing payload keeps no review internals.
  `ListingApprovalState` is exported and both fields are required, so a caller
  cannot silently drop them again.
- **The hero embed serves its school marks from our own assets.**
  `public/hero-loop-embed.html` requested ten marks from Google's favicon
  service. CSP blocked every one, so the homepage logged 20 console errors per
  load and the badges rendered bare. Eight of the nine schools have a
  self-hosted mark; Columbia has none and keeps its monogram, which is the
  designed fallback. The badge image styling now mirrors `.badge-logo-hires`
  from `app/globals.css`, which is what `LogoBadge` actually renders.
- **`scripts/logo-assets.test.mjs` now enforces the no-remote-marks rule across
  the tree**, not just against `LogoBadge.tsx`. It scans 136 files under `app/`,
  `components/`, `lib/` and `public/*.html` for favicon and logo services and
  for remote `<img>` sources. Verified by reintroducing the favicon URL and
  watching the test fail, then restoring it.

## Verification completed

- `npx tsc --noEmit`
- All 24 `test:*` scripts pass.
- `npx next build` with a build-only placeholder `SESSION_SECRET`.
- `node scripts/verify-wrong-data-shown.mjs` against local `next dev` and
  headless Chrome: hero embed renders 9 marks with zero remote sources, zero
  broken images and zero CSP errors, where the same page previously logged 20;
  24 catalogue cards with no repeated school on any admit line; the detail sheet
  showing three distinct admit chips; the word "Free" absent; and zero console
  errors and zero failed requests of any kind.
- A read-only scan of the live catalogue to size the duplicate-spelling fix.
  Counts only, no listing content recorded.
- `git diff --check`, and zero em dashes added to site copy.

Not verified in a browser: everything behind the seller login, which is the
money rendering and the price inputs. Those are asserted against the source in
the same script. A signed-in check needs a seller session against the production
database and was not attempted.

## What is left

3. The listing wizard: every "add" entry point reopening the newest draft, the
   wizard opening on the signed-out pane, the dashboard never being restored,
   and the client validating a browser `File` while the server validates
   `DraftAsset` rows.
4. Controls rendering far from the button that opened them.
5. Confirmations on the destructive actions, none of which currently ask.
6. Blocked. See below.

## Blocked, needs a decision

**Batch 6 (the seller verification surfaces) is a product decision, not a bug.**
The seller verification UI was deliberately removed in `a7f14e6`, and
`scripts/seller-applications.test.mjs` holds three assertions that fail if it
returns: no `seller-start-verification` and no `onStartVerification` in the
workspace, and no `id="seller-verification"` in `app/page.tsx`. The likely reason
is `67b49f8`, which made admin approval verify every admission a seller claims.
That reasoning does not cover the case the audit raises: a seller whose
acceptance letter is rejected still has no surface showing the admin's note and
no way to replace the file, even though `POST /api/seller/proofs/[id]/upload`
exists and works.

The prerequisite from batch 2 is now done, so batch 6 is blocked only on that
decision.

## Found but not fixed

- **`verificationLabel` can contradict `verificationStatus`.**
  `lib/sellerDashboardView.ts` can set the label to "Proof needs an update" on an
  application whose status is `verified`, because the two are computed from
  different sources. Invisible today since nothing renders verification state,
  and it becomes visible the moment batch 6 lands.
- **The per-application verification values are computed inside the grouping
  loop but only kept for the first listing in a group.** Later listings recompute
  and discard them. Same blast radius as above.
- **`Number.isInteger` is a client-side guard only.** The server still rounds.
  `lib/sellerDraft.ts` and `app/api/seller/listing-price/route.ts` were left
  alone because changing them without changing the `Int` columns would only move
  where the silent rounding happens.

## Environment

`DATABASE_URL` points at the production Supabase project. Reads are authorized
for this work; writes are not. `DIRECT_URL` is currently populated, so the
`prisma migrate` interlock described in the local notes is not in effect. Never
run `npm run build` (it applies migrations), `npm run db:push`, or
`npm run db:studio`. No production write, migration, or backfill was made.
`next dev` re-appends a generated block to `AGENTS.md` on every start; it is
reverted rather than committed, pending Fatimah's call.
