# Handover: engineering application essay guide

Read `AGENTS.md` first. This file records the current work in flight.

## Branch and base

Branch `ritvik/engineering-guide`, PR #95. Based on `main` after PR #93 merged
as `8ba69e6`. The merge from `main` changed only this handover file.

## What changed

- Added `/guides/engineering-application-essays`, a server-rendered guide for
  engineering applicants, and links between it and `/essays/engineering`.
- Registered the guide for the index, sitemap, and guide-to-collection checks.
- Added a cover photo with provenance recorded in commit `db8e05f`. The
  [Unsplash source](https://unsplash.com/photos/a-large-library-filled-with-lots-of-books-r0U2y0HhdGE)
  identifies Dominic Kurniawan Suryaputra and marks it free under the
  Unsplash License.
- Added read-time and page-verification scripts.

## Verification

- TypeScript and all `scripts/*.test.mjs` files pass.
- A direct `next build` passes and prerenders the new guide.
- `scripts/guide-read-time.mjs` passes against the built server. The new guide
  has 1,275 counted words and displays a six-minute read time.
- Current UC and Common App first-year guidance was checked against their
  official admissions pages for the article's application-process details.
- No database write, migration, backfill, or other hand-run deploy step.

## Remaining and found but not fixed

- Merge PR #95 after its Vercel check passes on this updated branch, then
  confirm the guide and sitemap on production.
- The pre-existing `public/blog-images/inspiration.webp` appears to carry a
  Dreamstime preview watermark and has no recorded license provenance. It is
  outside this PR and needs a separate rights review.
- The category pill is hidden on phone widths for all guides by an existing
  shared style. Several seller-entered school names on the engineering
  collection do not resolve to a logo. Neither is changed here.
