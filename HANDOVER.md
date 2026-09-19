# Handover: essay word counts

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch `ritvik/essay-word-counts`, based on `main` at `a18fce4`. No PR yet.

## Why this is a branch of its own

This work shipped inside the listing value panel PR (#96), on the reading that
only the backfill was a production write and the capture was not.

That reading was wrong. `ensureEssayWordCounts` calls `prisma.essay.updateMany`
against production, so both halves write, and Fatimah's "leave the production
word count update out for now" covers both. They were lifted out of #96 so that
PR is only the panel, which is what she reviewed, and parked here intact.

## What is here

- `scripts/essay-word-count.mjs`. The counting rules, over plain strings. No
  pdfjs, no Supabase, no Prisma, so the test can exercise every rule directly.
  It lives under `scripts/` because the backfill is a plain `.mjs` that cannot
  import TypeScript, and both paths must use one implementation or the number
  stored during review and the number stored by the backfill could disagree.
- `lib/essayWordCount.ts`. The server path. Counts the PDF buffers review has
  already downloaded, rather than fetching every file a second time, and writes
  the result.
- `lib/reviewRunner.ts`. One call, after the PDFs are fetched and before the
  panel runs. Best effort: never throws, has its own time budget, and a slow or
  corrupt PDF leaves `wordCount` null and the review carries on.
- `lib/review.ts`. `EssayPdf` carries `essayId` and `bytes` so the buffers can
  be reused. Neither field reaches the model.
- `scripts/extract-opening-lines.mjs`. Five helpers gain `export` so the
  counting code can reuse the same PDF text extraction. No logic change.
- `scripts/backfill-essay-word-counts.mjs`. The one-time fill for existing rows.
- `scripts/essay-word-count.test.mjs`, 46 checks, pure.

## What it writes

`prisma.essay.updateMany({ where: { id, wordCount: null }, data: { wordCount } })`.

Blanks only, so an existing value is never overwritten and two paths reaching
the same listing cannot fight. Reached from three entry points in
`lib/reviewRunner.ts`: a seller finalizing a draft, the review cron picking up a
pending listing, and the admin approval path. It is **not** limited to listings
created after the deploy.

## What it would make visible

`Essay.wordCount` is already a schema column and is already published by
`/api/listings` on `main`. Nothing renders it today because every row is null.
Once #96 merges, `essayGroupMeta` prints "N words" on a listing sheet row that
has a count, so merging this branch starts showing lengths on listings reviewed
afterwards while older ones stay blank, until the backfill fills the rest.

That uneven state is the argument for running the backfill in the same window as
merging this, rather than leaving weeks between them.

## Nothing has been run

The backfill has not been run against production and stays unrun. It is a
hand-run step that the Vercel deploy does not perform. No migration is needed:
the column already exists.

## Verification

- `npx tsc --noEmit` clean, all 29 `test:*` pass.
- No production write has been performed by this work.

## What is left

Fatimah's decision. If she wants it, this needs a PR, a merge, and then the
backfill run by hand in the same window.
