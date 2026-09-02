# Handover: bug-fix programme, batch 4 of 6

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/fix-misplaced-controls`

Base: `ritvik/remove-revise-path` (#78), on `ritvik/fix-listing-wizard` (#77),
on `ritvik/fix-wrong-data-shown` (#76), on `ritvik/fix-copy-and-cosmetics`
(#75), on `origin/main` at `dd48801`.

## What changed

Items 20, 22 and 23. Item 21 stays report-only.

- **The outcome editor renders inside the application card that opened it.** It
  used to render immediately before `SellerApplicationsWorkspace`, so pressing
  "Edit outcome" put the form above the hero, the profile card, the section
  header and every application card, with no scroll into view. It now replaces
  the read-only facts row in the same "Shared application details" block, and
  the topline button becomes Cancel while editing.
- **The listing price panel opens under its own row.** It used to be a
  `ListingCard` rendered after the entire workspace. It is now
  `components/seller/ListingPricePanel.tsx`, rendered inside the listing row,
  and the button that opened it becomes Close. It keeps what the old card
  showed: the sales count and the added date.
- **Saving a class year refetches instead of patching by key.** The save writes
  `gradYear` across every listing for that school, `gradYear` feeds
  `cycleLabel`, and `cycleLabel` is half the application group key, so the key
  the client held was invalidated by the request that had just succeeded.
  Groups merged or split on some later reload rather than on save. The
  `updateMany` is unchanged and still required by
  `scripts/seller-applications.test.mjs`; only the client changed.

Both editors are driven by props rather than slots, which is the convention in
this codebase. That meant `SellerApplicationListing` gained the fields the price
panel needs, and `lib/sellerDashboardView.ts` now resolves the tier floor
server-side rather than shipping the pricing tables to the client.

`ListingCard` and its two orphaned CSS blocks are deleted. Nothing rendered them
once the panel moved inline.

## Verification completed

- `npx tsc --noEmit`
- All 25 `test:*` scripts pass.
- `npx next build` with a build-only placeholder `SESSION_SECRET`.
- `node scripts/verify-inline-controls.mjs`, new, 15 assertions over the moved
  panels and the refetch.
- The three earlier DOM scripts re-run against local `next dev` and headless
  Chrome at 1440px and 390px, all passing.
- `git diff --check`, zero em dashes added.

`scripts/verify-wrong-data-shown.mjs` needed updating, not weakening: it counted
four whole-dollar price inputs in `app/page.tsx`, and two of them moved into the
new panel. It now counts across both files and additionally checks the panel
uses the same caps.

**Not verified in a browser.** The workspace is behind the seller login, so both
panels are asserted against the source. A signed-in walkthrough is still the
right check before merge, specifically: pressing "Edit outcome" and seeing the
form appear in place, pressing Edit on a published listing and seeing the price
panel open under that row, and saving a class year on a seller with two
application groups for one school.

## What is left

4. Controls rendering far from the button that opened them (items 20, 22, 23).
   Item 23 is why Edit does nothing on an approved or pending listing: it sets
   `activeListingControlId`, and that card renders after the entire workspace,
   far below the button. Confirmed pre-existing, untouched by batches 1 to 3.
   Item 22 is a client-side fix: `updateMany` is required to stay by
   `scripts/seller-applications.test.mjs`, and the real bug is the client
   patching state by a group key the save has just invalidated.
5. Confirmations on the destructive actions. **Take down has moved out of this
   batch into the revise-path removal (#78)**, because the guard should ship
   with the change that makes take down one way. Batch 5 keeps the other four:
   submit for review, approve and notify, reject and notify, and verify a proof.
   Do not build a take-down confirmation here, it will already exist.
6. Blocked on a product decision. See below.

## Blocked, needs a decision

**Batch 6, the seller verification surfaces, is a product decision.** The UI was
deliberately removed in `a7f14e6` and `scripts/seller-applications.test.mjs`
holds three assertions that fail if it returns. The likely reason is `67b49f8`,
which made admin approval verify every admission a seller claims. That does not
cover the case the audit raises: a seller whose acceptance letter is rejected has
no surface showing the admin's note and no way to replace the file, though
`POST /api/seller/proofs/[id]/upload` exists and works.

## Three things a signed-in walkthrough turned up, and what they were

- **Back on step 4 walked into the signup panes.** Steps 1 to 3 are verify
  email, enter code, set password. A seller who opens the wizard from their
  dashboard is already authenticated and starts at step 4, so Back landed on
  "Set a password", and filling it in posted a signup with no email token.
  **Identical on `main`**, where the same button also targets step 3; batches 1
  to 3 changed no Back button. A2 only made it reliably reachable, because the
  wizard now reliably lands on 4 instead of flashing step 1 first. Fixed here:
  from the dashboard the control is "Back to dashboard" and calls `closeSell`.
  The signup path keeps its original Back.
- **A blank "University of Washington" draft that looked auto-created was eight
  days old.** Both drafts on the account were created 2026-08-25, before this
  engagement. Nothing was written on submit. It surfaced because
  `/api/seller/drafts` filters to `draft` and `finalizing` and the banner shows
  `drafts[0]`: while the Cornell draft was open it was the most recently
  updated and masked the other one, and submitting it flipped it to `submitted`,
  dropping it out of the list. Batch 3 only made it surface sooner, because
  closing the wizard now refreshes the dashboard in place. Its shape
  (`target=UW`, one essay, no assets, step 3) is the A1 bug and the Back bug
  above writing themselves into a row.
- **"View" on a pending listing does nothing.** Confirmed as item 23, not new.
  `editWorkspaceListing` only opens a revision for `rejected` or `removed`;
  anything else sets `activeListingControlId`, and that card renders after the
  entire workspace, far below the button. Batch 4.

## The Drafts chip contains no drafts

Reported, not fixed, because fixing it is a feature.

`listingFilterForStatus` maps `approved` to Published and `pending` to In
review, and **everything else to "Drafts"**, so that chip is a catch-all holding
`rejected` and `removed` listings. A Cornell listing labelled "Taken down" is
what a seller sees when they click "Drafts 1".

`SellerApplicationDraft` rows never reach the workspace at all.
`getSellerDashboardView` queries `seller`, `listing` and `purchase` and no draft
table. The only `'draft'` in it is a fallback for a `Listing` whose status is
none of the four known ones, which finalize cannot produce. So
`listingStatusLabel('draft')` and `listingActionLabel('draft')` are unreachable.

The consequence, and it is the sibling of the A1 bug: the only surface for a
real draft is the banner, which shows `drafts[0]` while the API returns all of
them. **Any draft other than the most recently updated one is unreachable from
the entire UI.** This account has two, and one of them could not be opened by
any means until the other was submitted. Making drafts reachable is a feature
change, not a bug fix, so it is Fatimah's call.

## Found but not fixed

- **The essay-price input is vestigial in the wizard.** `app/page.tsx:601` notes
  that `'separate'` pricing survives only in the API and dashboard, so the
  per-essay price field inside each wizard row can never be reached.
- `verificationLabel` can contradict `verificationStatus`, and the per-application
  verification values are computed inside the grouping loop but kept only for the
  first listing in each group. Both invisible until batch 6.
- The whole-dollar guard from batch 2 is client-side only; the server still
  rounds. Fixing it properly means changing the `Int` columns.
- **Opening a draft is a production write.** Restoring one sets `activeDraftId`,
  which fires the autosave effect and PATCHes the row, bumping its revision and
  `updatedAt`. So merely looking at a draft writes to the database, and it
  resets the 30-day abandonment clock in `lib/sellerDraftRetention.ts`: a draft
  a seller keeps opening never expires. Pre-existing, on `main`.

## Environment

`DATABASE_URL` points at the production Supabase project. Reads are authorized
for this work; writes are not. `DIRECT_URL` is currently populated, so the
`prisma migrate` interlock described in the local notes is not in effect. Never
run `npm run build` (it applies migrations), `npm run db:push`, or
`npm run db:studio`. A bare node script does not load `.env.local`; the
read-only counts above were taken with `node --env-file=.env.local`. No
production write, migration, or backfill was made. `next dev` re-appends a
generated block to `AGENTS.md` on every start; it is reverted rather than
committed, pending Fatimah's call.
