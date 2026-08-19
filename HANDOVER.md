# Handover: ranked browse catalogue and compact background tags

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/fix-card-tag-spacing`

Base: `origin/main` at `cc93050` (`Use accurate essay titles and college logos
(#33)`).

## What changed

- Browse now follows the 2026 U.S. News Best National Universities ranking
  school by school, including ties. Listings for the same university remain
  together and keep their existing API order.
- Ranked top-50 universities appear first. Schools outside that list fall back
  to Admitfolio's existing price tier and then alphabetical order.
- The rank resolver uses `schoolInfo`, so aliases such as `UC Berkeley` and
  `University of California, Berkeley` share one rank, while Penn State cannot
  inherit UPenn's rank.
- The ranking affects display order only. It does not change prices, approvals,
  school titles, or database rows.
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

- `npm run test:university-ranks`
- `npm run test:listing-schools`
- `npx tsc --noEmit`
- Direct `npx next build` with temporary build-only values.
- Visible Browser check against the real app on port 3002.
- The first live-data schools now appear as Harvard, Stanford, Yale, UChicago,
  Johns Hopkins, Northwestern, UPenn, Cornell, Columbia, then UC Berkeley.
  Princeton and MIT correctly do not appear because the current catalogue has
  no listings for them.
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
