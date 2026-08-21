# Handover: Shared navbar on guide pages

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/complete-essay-guides`

Base: `origin/main` at `62976ef`, after the seven-guide library and redesigned
Blog index were merged and deployed.

Worktree: `/private/tmp/admitfolio-all-guides`

## Why this change

The guide pages used a separate `GuideHeader` structure plus guide-only CSS
overrides. That made their navbar narrower, white, and visually inconsistent
with the marketplace homepage.

## What changed

- Rebuilt `GuideHeader` with the homepage navbar structure and global design
  system classes.
- Restored the homepage links: Browse essays, Featured, Sell your essays,
  Seller login, and the rounded Find my matches action.
- Added the same mobile menu behavior to all guide pages.
- Removed guide-only navbar and footer overrides from the Blog stylesheet.
- Added `?matches=1` support on the homepage so the guide navbar action opens
  the real in-page matcher after navigation.
- Left the approved Blog index cards and all seven article layouts unchanged.

## Verification

- `git diff --check` and `tsc --noEmit` passed.
- Direct `next build` passed with harmless build-only placeholder values. No
  migration, database access, or production write ran.
- Homepage and guide navbar computed styles match at desktop size, including
  background, height, padding, logo typography, and primary action styling.
- The guide navbar and mobile menu were visually checked in the visible browser.
- At 390px, the menu contains all four actions and has no horizontal overflow.
- Find my matches navigates to the homepage and opens the real matcher.

## What is left

1. Push the navbar fix to `main`.
2. Wait for Vercel and verify the homepage and guide navbar live.

No migration, backfill, or production data write is needed.

## Unrelated workspace state

The original workspace has pre-existing edits for cards, the essay reader,
school naming, checkout previews, and other work. They were not touched or
staged. This navbar fix is isolated in the clean worktree above.
