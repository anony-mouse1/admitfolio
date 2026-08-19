# Handover: compact browse-card background tags

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/fix-card-tag-spacing`

Base: `origin/main` at `cc93050` (`Use accurate essay titles and college logos
(#33)`).

## What changed

- Browse-card background tags stay on one line in Cards view instead of wrapping
  into the fixed-height hidden area.
- When space is tight, long tag text truncates with an ellipsis rather than
  creating a blank-looking second row.
- The `+N` overflow pill never shrinks, and every visible tag exposes its full
  text through its title.
- Rows view is unchanged.
- The real-data mock at `public/browse-mockup.html` has the same behavior. It is
  gitignored and must not be committed or deployed.

## Verification completed

- `npx tsc --noEmit`
- Direct `npx next build` with temporary build-only values.
- Visible Browser check against the real app on port 3002.
- DOM measurements across the first 24 production-backed cards confirmed every
  visible tag remains on the same row and the `+N` pill remains visible.

## Production status

PR #33 was merged and Vercel deployed it successfully. The approved production
title backfill wrote 139 safe opening lines. Five listings could not produce a
safe unique sentence and kept the neutral fallback.

This tag-spacing fix is local only until its focused branch is pushed and merged.
No database write or migration is needed.

Unrelated pre-existing local edits remain in `components/EssayReader.tsx`,
`scripts/purchase-fulfillment.test.mjs`, and `public/vendor/`. Do not stage or
revert them as part of this fix.
