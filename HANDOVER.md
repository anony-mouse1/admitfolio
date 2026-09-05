# Handover: batch 5, confirmations on outward-facing actions

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/confirm-destructive-actions`

Base: `ritvik/remove-drafts-chip` (#80), on `ritvik/fix-misplaced-controls`
(#79), on `ritvik/remove-revise-path` (#78), on `ritvik/fix-listing-wizard`
(#77), on `ritvik/fix-wrong-data-shown` (#76), on
`ritvik/fix-copy-and-cosmetics` (#75), on `origin/main` at `dd48801`.

## What changed

The four remaining actions that reach a real seller now ask first. Take down
already shipped in #78 and is untouched here.

- **Submit for review.** Creates the listing, starts the automated review and
  emails both the admin and the seller. Since #78 a reviewed listing cannot be
  edited, so this is the last point at which anything can change, and the
  confirmation says exactly that.
- **Approve and notify.** Publishes and emails the seller. The copy names the
  consequence that is easiest to miss: per `HANDOVER.md` and
  `app/api/admin/decision`, approving any listing marks **every** admission that
  seller claims as verified, on this listing and every other.
- **Reject and notify.** Emails the seller, and under the new policy is the end
  of the road for that submission. The copy says whether a note is attached,
  because with no note the seller is told only that it was not approved.
- **Verify a proof.** Records the decision against the admin's email and stops
  the seller replacing the letter. Rejecting a proof already asked, through a
  `window.prompt` that requires a reason, and is left alone.

Each states what it is about to do rather than asking whether you are sure, and
each names the specific listing, school or seller so the wrong row cannot be
actioned by accident.

`app/admin/ConfirmDialog.tsx` is one component for the three console actions,
shaped like the existing support-view dialog. The public page reuses the
`.modal-overlay` / `.modal` convention and the `.confirm-*` styles added in #78.
Both public confirmations join `anyOpen` for the body scroll lock and sit at the
top of the Escape chain, above the wizard's `over-dash` layer.

## Verification completed

- `npx tsc --noEmit`
- All 26 `test:*` scripts pass.
- `npx next build`
- **The three console confirmations are verified live**, through
  `/admin?preview=1`, which renders against inline mock data with no session and
  no database and where every decision is a no-op. For each: the button opens a
  dialog, the dialog has a title and both a way forward and a way out, its copy
  does not fall back on "are you sure", and cancelling closes it and changes
  nothing. No real listing was touched and no email was sent.
- `node scripts/verify-destructive-confirmations.mjs` also covers submit for
  review against the source, since that sits inside the authenticated wizard.
- The four earlier DOM scripts re-run at 1440px and 390px, all passing.
- `git diff --check`, zero em dashes added.

One assertion from #78 needed re-anchoring rather than weakening:
`verify-listing-wizard.mjs` pinned the scroll-lock line by its ending, and
adding the second confirmation to that line made a still-true check read as
false. It now looks for take down within the line rather than at the end of it.

**Not verified in a browser:** submit for review, which is inside the
authenticated wizard. Asserted against the source.

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
