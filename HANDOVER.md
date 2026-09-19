# Handover: the listing value panel

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch `ritvik/listing-value-panel`, PR #96. Rebased onto `main` at `a18fce4`,
after #93, #95 and #97 merged.

## Why

The listing sheet stated what a package contained inside a `<details>` that
shipped closed and sat below the price and the Unlock button, so the one thing
that justified the price was a click away and behind the decision it informed.
Listing view to unlock is the biggest raw drop in the funnel.

## What changed

- "What you get" is a panel, always open, above the price. One row per distinct
  essay, grouped on prompt and question text.
- On a phone the price and Unlock button are pinned to the bottom of the sheet,
  so the button is reachable no matter how long the panel is.
- Word counts are captured during review and shown per row when present.

## The header change, from Codex's review

The panel headed a nine essay listing with "9 essays" and printed "$21 an essay"
under the price. Together those read like a menu you could order one item from,
and the unit of purchase is a listing.

- The heading is now **"All 9 essays, sold together"**. A single essay listing
  has nothing to disambiguate and still reads "One essay".
- The per-essay figure stays, because it is what makes a $189 package legible
  next to a $40 single, but it now reads **"works out at $21 an essay"**, which
  is plainly arithmetic on the price above rather than a price anything can be
  bought at.
- "for the whole set" and "Unlock 9 essays" are unchanged. Neither implies a
  per-essay purchase, and the Unlock button's width feeds the 390 fold
  measurement, so it was left alone.

## Re-measured at 390 and 1440, 2026-09-19

Against a production build of the rebased branch. All six cases, both
viewports, first paint and hydrated. **432 checks passed, 0 failed.**

| case | unlock ends (390) | fold | panel h (390) | rows |
|---|---|---|---|---|
| four identical PIQs, one row, no college | 615 / 618 | 844 | 219 | 1 |
| most rows in the catalogue (11 essays) | 798 | 844 | 713 | 8 |
| most essays in the catalogue (18 essays) | 798 | 844 | 599 | 7 |
| single essay | 657 | 844 | 219 | 1 |
| longest seller question, 1,201 chars | 798 | 844 | 328 | 2 |
| college known, three rows | 798 | 844 | 322 | 3 |

The Unlock button is fully above the 844 fold in every case, with 46px to spare
in the worst one. First paint and hydrated differ by at most 3px, on one case.

The header assertion was checked by breaking what it guards: reverting the two
strings failed both the heading check and the per-essay pattern, on all six
cases at both viewports.

`scripts/verify-listing-value-panel.mjs` now documents the `COLLECTIONS`
environment variable it needs. Without it the script silently skipped every
case while still reporting success, which is how it looked like it took no
arguments.

## The production word count update, for Fatimah to decide

Two separate things, and only one of them is the backfill.

1. **`scripts/backfill-essay-word-counts.mjs` has not been run and stays
   unrun.** This is the thing that was asked to be left out. No change.

2. **The capture in `lib/essayWordCount.ts` does write to production**, and
   this is not what "not a production write" described. `ensureEssayWordCounts`
   calls `prisma.essay.updateMany` to fill `Essay.wordCount`. It is reached from
   `lib/reviewRunner.ts`, so it runs on every listing that passes through review
   after the deploy, from three entry points: a seller finalizing a draft, the
   review cron picking up a pending listing, and the admin approval path. It is
   not limited to listings created after the deploy.

   It fills blanks only. The `updateMany` matches `wordCount: null`, so an
   existing value is never overwritten.

   It is also visible. Once a row has a count, the panel prints "N words" on
   that row, so listings reviewed after the deploy show lengths while older ones
   do not, until something fills the rest. The thing that would fill the rest is
   the backfill in point 1.

The note is in `lib/essayWordCount.ts` as well, at the top, so it is read by
whoever touches that file next.

## Verification

- `npx tsc --noEmit` clean, all 30 `test:*` pass.
- 432 panel checks against a production build, 0 failed.

## What is left

Fatimah's decision on point 2 above, then review and merge. No migration. The
backfill is a hand-run step that is deliberately not being run.
