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
- A row shows its length when the essay has one recorded. No essay does today.

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

## The word count work is no longer here

`lib/essayWordCount.ts`, `scripts/backfill-essay-word-counts.mjs` and their
tests were lifted out of this branch onto `ritvik/essay-word-counts`, based on
`main` at `a18fce4`.

They shipped here on the reading that only the backfill was a production write
and the capture was not. `ensureEssayWordCounts` calls
`prisma.essay.updateMany` against production, so both halves write, and
Fatimah's "leave the production word count update out for now" covers both.
This PR is the panel and nothing else, which is what she reviewed.

What stays is `EssayGroup.words` and the "N words" branch in `essayGroupMeta`.
That is display code for `Essay.wordCount`, which is already a schema column
and is already published by `/api/listings` on `main`. Every row is null today,
so the panel prints no word count anywhere, which is asserted rather than
assumed: the verifier checks `wordsText` is empty on all six cases at both
viewports, and a read of the live catalogue found no essay with a count.

## Verification

- `npx tsc --noEmit` clean, all 29 `test:*` pass.
- 432 panel checks against a production build, 0 failed.

## What is left

Review and merge. No migration, backfill, database write or hand-run deploy
step. The word count work is a separate decision on its own branch.
