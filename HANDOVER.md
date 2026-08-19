# Handover: production browse parity

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/fix-card-tag-spacing`

Base: `origin/main` at `cc93050` when the branch was created. `origin/main`
later advanced to `3fc5570` with the purchased-reader fix. The browse changes do
not overlap that reader work.

## What changed

- Browse cards now match the approved localhost mock geometry at a 1280px
  viewport: 358.7 by 366.2px, instead of the production-only 340 by 415px
  portrait shape.
- The card grid uses a 22px gap and no extra right padding, matching the mock.
- Production-only minimum heights and invisible placeholder rows were removed.
  Grid stretching still aligns every card within a row.
- The card label now says `Seller attends`, matching the mock and distinguishing
  the seller's current school from the college the essays target.
- Browse sorts by the exact 2026 U.S. News National Universities rank when a
  ranked school is available. Unranked schools fall back to the existing price
  tier, then canonical school name.
- With the current 144-listing catalogue, the first six results are Harvard
  (single), four Stanford listings (three packages and one single), then Yale.
  The first row therefore includes both a single essay and packages without
  breaking rank order.
- Card background tags stay on one line and the `+N` overflow tag does not
  shrink.
- Ranking regression tests cover Harvard, Stanford and Yale order, the initial
  single/package mix, future Princeton/MIT inventory, rank ties, aliases and
  unranked fallbacks.

## Opening-line audit

- No production title rewrite was needed. Production already derives card
  titles from PDFs in the exact listing through `Listing.openingLine`.
- The localhost mock is not the title source of truth. Its ignored HTML contains
  a manually hardcoded `OPENINGS` map for 137 listings, while production has 144.
- The audited Stanford package's mock line and live line both come verbatim from
  essays sold in that package. The mock hardcodes the Common App opening. The
  production extractor selected a later short-answer opening because it scored
  higher and avoided seller-wide duplicates.
- Live currently has 139 PDF-derived opening lines. Five unreadable or unsafe
  cases use the intentional seller-summary or prompt fallback. There are no
  duplicate stored opening lines within a seller.
- Do not overwrite production titles from the mock's stale map. If the product
  rule changes to specifically require the first listed essay instead of the
  strongest safe excerpt in the package, that requires a new extractor version,
  reviewable dry-run and explicitly approved production backfill.

## Verification completed

- Visible side-browser QA against the production-backed local app on port 3003.
- DOM measurements: first three cards are all 358.7 by 366.2px, grid gap is
  22px, grid padding is `14px 0 0`, and page overflow is zero.
- First six schools: Harvard, Stanford, Stanford, Stanford, Stanford, Yale.
- First row types: single, package, package.
- Rows view still switches correctly and has zero horizontal overflow.
- Read-only PDF extraction reproduced the live Stanford opening line exactly.
- `npm run test:university-ranks`
- `npm run test:listing-schools`
- `npm run test:opening-lines`
- `npm run test:commerce`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npx tsc --noEmit`
- Direct `npx next build` with temporary build-only values. No migration ran.

## Production status

PR #36 is the existing focused browse PR. Push the final layout/test commit,
merge PR #36 into `main`, monitor Vercel, then repeat the browser measurements
on `https://admitfolio.com/#browse`.

No database write, migration or title backfill is required for this rollout.

Unrelated pre-existing local edits remain in `components/EssayReader.tsx`,
`scripts/purchase-fulfillment.test.mjs`, and `public/vendor/`. Do not stage or
revert them as part of this fix.
