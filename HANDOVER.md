# Handover: bug-fix programme, batch 1 of 6

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/fix-copy-and-cosmetics`

Base: `origin/main` at `dd48801` (`Update verification deployment handover`).

This is the first of six batches working through the 32-item bug audit. Each
batch gets its own branch, cut from the previous batch's tip, so the six pull
requests stay reviewable on their own. Batches 1 to 5 all edit `app/page.tsx`,
which is why they are stacked rather than opened independently off `main`.

## What changed

Copy and cosmetics only. No behaviour, no data, no schema.

- The browse card and the wizard hint now say "Accepted at" rather than
  "Accepted in". A stale comment in `app/globals.css` was updated to match.
- "Blog" moved out of the Legal footer column into Product, in both the main
  footer (`app/page.tsx`) and the guides footer (`components/GuideShell.tsx`).
- The three em dashes in site copy are gone: one in the sell modal's spam-folder
  hint, two in admin labels. The four remaining occurrences in the codebase are
  exempt (a regex character class, mock note data, a code comment, and a prompt
  string that interpolates `Essay.question`).
- Acceptance-proof rows now carry real separator text between the school and the
  filename. The two spans sit at opposite ends of a flex row, so the accessible
  name and any copied text previously ran together as
  "Cornell UniversityScreenshot....png".
- `LogoBadge` alt text resolves through `schoolShortName()`, so all nine call
  sites now announce "Harvard logo" rather than "Harvard University logo".
- Essay rows in the wizard are keyed by `row.clientKey` instead of the array
  index. The file input is uncontrolled, so an index key let React reuse the DOM
  node by position and a removed row left its picked file on the row below it.

Verification tooling, committed rather than left in a scratchpad:

- `scripts/verify-copy-and-cosmetics.mjs`, a headless-Chrome DOM check for this
  batch.
- `scripts/verify-browse-ui.mjs` now defaults to `localhost` instead of
  `127.0.0.1`. See "Found but not fixed" below.

## Verification completed

- `npx tsc --noEmit`
- All 24 `test:*` scripts pass.
- `npx next build` with a build-only placeholder `SESSION_SECRET`.
- `node scripts/verify-copy-and-cosmetics.mjs` against local `next dev` and
  headless Chrome, at 1440px and 390px: 24 cards each carrying an "Accepted at:"
  label, zero "Accepted in" anywhere in the rendered page, zero em dashes in
  site copy, Blog present in the Product footer column and absent from Legal,
  zero horizontal overflow, and every school chip's logo alt text matching the
  resolved short name.
- `git diff --check`

Not verified in a browser: the proof-row separator and the essay-row key both
sit inside the authenticated sell wizard, so they are asserted against the
source instead, in the same script.

## Found but not fixed

- **`public/hero-loop-embed.html` requests Google's favicon service** for ten
  school domains (`https://www.google.com/s2/favicons?domain=...`). The site CSP
  in `next.config.js` blocks every one, so the homepage logs 20 console errors
  on each load and those badges render without marks. This contradicts the
  invariant that no browser request is ever made to a favicon service.
  `scripts/logo-assets.test.mjs` enforces that rule against `LogoBadge.tsx` only,
  which is how this file slipped past it. Now scheduled into batch 2, together
  with widening that test so no other file can reintroduce it.
- **Next's dev server refuses `/_next/static` chunks to a `127.0.0.1` page
  origin**, returning 403 and leaving the catalogue stuck on "Loading essays".
  `scripts/verify-browse-ui.mjs` defaulted to `127.0.0.1`, so it could not have
  passed as written. Both verification scripts now default to `localhost`.
- **`SUPABASE_URL` in `.env.local` is a `urldefense.com` Proofpoint-wrapped
  link** rather than the bare project URL. It is consumed as a string prefix in
  `lib/supabase.ts` and five scripts, so storage reads and uploads fail locally.
  Environment only, no code change.

## What is left

Batches 2 to 6 of the audit, in order, each gated on review of the one before:

2. Wrong data shown: pending money rendering as `$0.00`, a hard-coded zero
   Stripe fee, duplicate schools in "Accepted at", a null price rendering as
   "Free", silent cent rounding, and `isAdminApprovedListing` being handed a row
   with `humanReviewedAt` and `aiDecision` stripped out. Plus two items added
   after the batch 1 review: the hero-embed favicon requests above, and widening
   `scripts/logo-assets.test.mjs` so the no-favicon-service rule is enforced
   across the whole tree rather than only `LogoBadge.tsx`.

   Decided for batch 2: prices stay whole dollars. `packagePrice` is an `Int`
   and accepting cents would be a schema change, which is not ours to make. The
   fix is `step="1"`, a visible hint, and a client-side guard. The price inputs
   also disagree on bounds, so the dashboard editors (`app/page.tsx:4247` and
   `:4254`), which currently have no `max` at all, get one to match the wizard's
   99 per essay and 399 per package.
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
`scripts/seller-applications.test.mjs` now holds three assertions that fail if it
returns: no `seller-start-verification` and no `onStartVerification` in the
workspace, and no `id="seller-verification"` in `app/page.tsx`. The likely reason
is `67b49f8`, which made admin approval verify every admission a seller claims.
That reasoning does not cover the case the audit raises: a seller whose
acceptance letter is rejected still has no surface showing the admin's note and
no way to replace the file, even though `POST /api/seller/proofs/[id]/upload`
exists and works. Do not build it or delete those assertions without a decision.

Item 12 in batch 2 must land before any of batch 6. `lib/sellerDashboardView.ts`
drops `humanReviewedAt` and `aiDecision` when it maps listings, so
`isAdminApprovedListing` collapses to `status === 'approved'` and every
AI-auto-approved listing grants seller-wide verification. It is invisible only
because nothing renders verification state yet.

## Environment

`DATABASE_URL` points at the production Supabase project. Reads are authorized
for this work; writes are not. `DIRECT_URL` is currently populated, so the
`prisma migrate` interlock described in the local notes is not in effect. Never
run `npm run build` (it applies migrations), `npm run db:push`, or
`npm run db:studio`. No production write, migration, or backfill was made.
