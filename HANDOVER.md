# Handover: bug-fix programme, batch 3 of 6

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/fix-listing-wizard`

Base: `ritvik/fix-wrong-data-shown` at `8eb3bff`, open as PR #76, which sits on
`ritvik/fix-copy-and-cosmetics` (PR #75), which sits on `origin/main` at
`dd48801`.

## What changed

Two root causes, fixed as root causes rather than symptom by symptom.

### The wizard was bound to whichever draft was newest

`openSellFromDashboard` took a `preferredDraftId` that three of its four callers
passed as `''`, which fell through to `drafts[0]`. With any saved draft present,
every "add" button reopened it and silently discarded the school that was
clicked. It also opened the modal before knowing what it was opening.

- The argument is replaced by an explicit `SellWizardTarget`, either
  `{ mode: 'new', prefillSchool }` or `{ mode: 'resume', draftId }`. There is no
  fallback: a resume that cannot find its draft says so instead of opening a
  different listing. The type checker found all three call sites.
- `sellStep` is set to 4 before the modal is shown. It used to be set only after
  the drafts fetch resolved, so the wizard opened on step 1, "Verify you're a
  student", which reads as a forced logout to a signed-in seller.
  `fullResetSell` now resets the step as well, so a later open cannot flash the
  pane the previous one ended on.
- The wizard now layers over the dashboard instead of closing it. The dashboard
  is a full-page fixed overlay at `z-index: 200` and `.modal-overlay` is 100,
  which is why the original code closed it: the wizard would otherwise render
  underneath. A scoped `.modal-overlay.over-dash { z-index: 300 }` lifts only
  the sell wizard, and only when it was launched from the dashboard, so the
  other three modals keep their stacking. The page behind the wizard no longer
  changes at all. Escape now closes the wizard before the dashboard beneath it.
- Closing the wizard reloads the dashboard in place. An earlier version of this
  fix reopened the dashboard without refetching, which left `resumableDraft`
  null and made the "Resume your application" banner disappear after any trip
  through the wizard. Reloading also picks up a listing that was just submitted.
- Opening a listing for changes is guarded and shows its progress. It posts a
  revision and then reads the drafts back, roughly three seconds, and the button
  stayed enabled throughout, so it could be clicked repeatedly and each click
  started another revision. The button now reads "Opening…", is disabled while
  the work is in flight, and a second call returns immediately.
- A failed drafts fetch now reports the failure and returns to the dashboard. It
  used to create a replacement draft, so a network blip while opening "Resume
  application" started a blank listing with no error and left the real draft
  behind.

### The client validated a browser File, the server validated DraftAsset rows

The draft submit path never sends the file, so any disagreement was
unrecoverable without re-picking.

- Submit validation is now path-aware. With a draft id the finalize route reads
  staged `DraftAsset` rows, so that is what is checked; without one the direct
  route uploads the browser `File`, so that is what is checked. Both essay rows
  and acceptance-proof rows.
- A failed staging upload is surfaced at the moment it happens. Both upload
  handlers set the filename before awaiting `stageDraftAsset`, so a failed upload
  left the row rendering as attached and passing validation. The row is now
  cleared and an error is shown.
- The revision route only claims a source essay when `finalize` can actually
  accept it, which needs both `pdfPath` and `contentHash`. Legacy rows predate
  `contentHash`, so claiming them produced a row that looked attached, passed
  the client, and was rejected on submit.
- Restored filenames use the generic label. `storedFileName` used to return the
  last path segment when it ended in `.pdf`, which surfaced `<essayId>.pdf` for
  legacy rows and a roughly 100 character hash for current uploads. The seller's
  own filename lives on `DraftAsset.fileName` and has no equivalent on `Essay`.

## The backfill was run

`scripts/backfill-essay-content-hashes.mjs --confirm` was run against production
on 2026-09-02 with Fatimah's written authorization, relayed by Ritvik. It is the
only production write of this engagement. It sets `Essay.contentHash` and
nothing else, on rows where `pdfPath IS NOT NULL AND contentHash IS NULL`, so it
cannot overwrite an existing hash and is safe to rerun.

Result: **576 files downloaded, 576 hashed, 0 failed, 576 hashes written.**

| | before | after |
|---|---|---|
| essays with a null `contentHash` | 590 | **14** |
| revisable listings with no reusable essay | 28 of 29 | **1 of 29** |

The 14 remaining are exactly the rows that have no `pdfPath` at all, so there is
nothing to hash and no rerun will help them: 10 sit in pending listings and 4 in
one rejected listing, which is the single remaining unusable one. `SUPABASE_URL`
had to be corrected from a Proofpoint-wrapped link to the bare project URL first,
or every download would have failed.

The script reported 11 exact duplicate groups covering 37 essay rows in pending
or approved listings. Ten of the eleven span two different listings, which
turned out to be a product defect rather than seller error. See below.

## The duplicate rule blocked the ordinary shape of an application

Investigating those duplicate groups turned up a real defect, raised by Ritvik.
The seller-side check refused the same PDF in any two of a seller's active
listings. But one Common App personal statement is genuinely submitted to every
school on the application, so a seller with a Harvard package and a Yale package
has to put the same file in both. The rule forbade the thing the product exists
to sell.

It was not hypothetical: of the 11 duplicate groups already live, **10 span two
different listings**, which is exactly this pattern. They only got in because
hashes did not exist yet. Going forward the rule blocked every new one, and any
of those ten sellers who revised an affected listing would have hit a 409 they
could not act on.

The rule is now scoped to the college rather than the seller. The same file in
two packages for different colleges is allowed; twice for the same college is
still refused, because a buyer comparing those two packages would pay twice for
one essay. The same-file-twice-within-one-package check is unchanged.

This is a product decision as much as a fix, so it is called out prominently in
PR #77 for Fatimah rather than buried: it changes what a buyer can be sold.
The deeper question, what a buyer who owns two overlapping packages should pay,
is untouched and is the real follow-up.

Implementation notes:

- The rule lives in `lib/essayDuplication.ts` and all three enforcement points
  call it (`drafts/[id]/finalize`, `submit-listing`, `upload-essay`). They
  previously carried three separately worded copies of the same logic, which is
  the same drift that made the client and server disagree about attached files.
- Both sides resolve through `lib/schools` rather than comparing strings, so
  "Penn State" stays separate from "University of Pennsylvania" and
  "Harvard College" still matches "Harvard University".
- A legacy listing with no explicit `targetSchool` and several admits has no
  single college, so it conflicts with any school it claims. An unresolvable
  college on the incoming side keeps the older, stricter answer.
- `scripts/essay-duplication.test.mjs` (`npm run test:essay-duplication`)
  executes the module against all of those cases, and also asserts that all
  three routes go through it and that none keeps the old message.

## The number that mattered before the backfill

A read-only count against production, aggregates only:

| | |
|---|---|
| essays total | 687 |
| essays with no `contentHash` | **590**, now 14 |
| essays with no `pdfPath` | 14 |
| rejected or removed listings | 29 |
| of those, every essay unusable for reuse | **28**, now 1 |

This was the case for running the backfill, and it has now been run. Only one
listing is still in that state, and its essays have no stored file at all.

Two other counts taken at the same time, for later batches: 238 of 263 listings
have a null `gradYear`, and 141 have a null `targetSchool` with more than one
admit, which is the population getting the "seller attends" headline.

## Verification completed

- `npx tsc --noEmit`. The type change to `openSellFromDashboard` is what located
  all three callers.
- All 24 `test:*` scripts pass.
- `npx next build` with a build-only placeholder `SESSION_SECRET`.
- `node scripts/verify-listing-wizard.mjs`, 24 assertions over the changed
  source.
- A live stacking check in headless Chrome, mounting both overlays as the app
  does: dashboard 200, wizard 300, the other modals still 100, and the wizard
  topmost at the centre of the viewport.
- `scripts/verify-copy-and-cosmetics.mjs` and `scripts/verify-wrong-data-shown.mjs`
  both re-run against local `next dev` and headless Chrome as regressions, both
  passing.
- `git diff --check`, and zero em dashes added to site copy.

**Not verified in a browser, and this is the weak point of the batch.** The whole
wizard sits behind the seller login. Driving it would mean authenticating against
the production database, which this work is not allowed to do, so every flow
change here is asserted against the source instead.

A walkthrough by the signed-in seller found three things the source assertions
could not: the background still changed when the wizard opened, the resume
banner vanished after a trip through it, and the Edit button had no busy state.
All three are fixed above. The remaining flows worth a human check are clicking
"+ Add an application" with a saved draft present, "Fix and resubmit" on a
rejected listing, and picking an essay file while offline.

## One test assertion was changed, not just added

`scripts/seller-revision.test.mjs` pinned the literal `sourceEssayId: essay.id`,
which the fix necessarily breaks. It is replaced with two assertions that are
strictly more specific: that a reusable essay still references its source, and
that reusability is defined as having both the things `finalize` requires. The
original intent is preserved.

## What is left

4. Controls rendering far from the button that opened them (items 20, 22, 23).
   Item 23 is why Edit does nothing on an approved or pending listing: it sets
   `activeListingControlId`, and that card renders after the entire workspace,
   far below the button. Confirmed pre-existing, untouched by batches 1 to 3.
   Item 22 is a client-side fix: `updateMany` is required to stay by
   `scripts/seller-applications.test.mjs`, and the real bug is the client
   patching state by a group key the save has just invalidated.
5. Confirmations on the destructive actions, none of which currently ask.
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
