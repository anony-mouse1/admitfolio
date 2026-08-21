# Handover: Studley-style Blog index

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/complete-essay-guides`

Base: `origin/main` at `00a8d32`, after the full seven-guide library was
merged and deployed.

Worktree: `/private/tmp/admitfolio-all-guides`

## Why this change

Fatimah approved `public/blog-studley-inspired-mockup.html` and asked for the
real Blog section to match that StudyFetch and Studley-inspired direction.

## What changed

- Rebuilt the real `/guides` index around the approved centered Blog intro,
  topic chips, and two-column article grid.
- Added the approved visual cover artwork for all seven guides using CSS, so
  there are no third-party image requests or licensing dependencies.
- Kept all seven real guide routes, titles, descriptions, metadata, canonical
  URL, and article content intact.
- Updated the guide navigation from “Featured” to “Blog” so readers can return
  to the Blog index from any guide.
- Scoped the header, index, card, and footer styling to the guide section. The
  marketplace homepage and seller flows were not changed.
- Added a one-column phone layout with the same artwork and card hierarchy.

## Verification

- `tsc --noEmit` passed.
- Direct `next build` passed with harmless build-only placeholder values. No
  migration, database access, or production write ran.
- The real local `/guides` page renders seven linked article cards and four
  topic chips.
- Desktop and 390px mobile layouts were visually checked in the visible browser.
- The page has no horizontal overflow or browser console errors at either size.
- The mobile header hides secondary navigation and keeps the primary Browse
  essays button visible.

## What is left

1. Push the new index design to `main` only after Fatimah asks.
2. Wait for Vercel and verify the live `/guides` page after deployment.

No migration, backfill, or new asset upload is needed.

## Unrelated workspace state

The original workspace has pre-existing edits for cards, the essay reader,
school naming, checkout previews, and other work. They were not touched or
staged. This Blog work is isolated in the clean worktree above.
