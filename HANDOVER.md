# Handover: Unique Blog photos and staggered dates

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/complete-essay-guides`

Base: `origin/main` at `85f9512`, after the seven-guide library, redesigned
Blog index, and shared navbar were merged and deployed.

Worktree: `/private/tmp/admitfolio-all-guides`

## Why this change

Fatimah supplied seven Blog photos and asked for each one to appear on the most
relevant guide without repeating any image. She also asked for the post dates
to be staggered instead of showing August 20 on every article.

## What changed

- Added seven compressed WebP cover photos under `public/blog-images/`.
- Mapped one unique photo to every guide. No image path is reused.
- Kept the existing Blog layout, navbar, cards, copy, spacing, and footer intact.
- Added accessible alt text and a photo-only cover treatment inside the existing
  card dimensions.
- Staggered the guide dates from July 25 through August 20, 2026.
- Matched each article's visible date, Open Graph article dates, and JSON-LD
  `datePublished` and `dateModified` to its Blog index date.

## Verification

- `git diff --check` and `tsc --noEmit` passed.
- Direct `next build` passed with harmless build-only placeholder values. No
  migration, database access, or production write ran.
- The real local `/guides` page was visually checked in the visible browser.
- All seven photos loaded, all seven image paths were unique, all seven dates
  were distinct, and the page had no horizontal overflow.
- The supplied classroom photo is used on the UC PIQ guide.

## What is left

1. Commit and push the photo and date update to `main`.
2. Wait for Vercel and verify the live Blog index and article metadata.

No migration, backfill, or production data write is needed.

## Unrelated workspace state

The original workspace has pre-existing edits for cards, the essay reader,
school naming, checkout previews, and other work. They were not touched or
staged. This Blog update is isolated in the clean worktree above.
