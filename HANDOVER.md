# Handover: accurate essay-derived card titles

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/accurate-essay-card-titles`

Base: `origin/main` at `8989351` (`Merge pull request #32 from
anony-mouse1/codex/fix-card-data-parity`). This branch is intentionally separate
from the unpushed `codex/seller-university-integrity` migration branch.

## What changed

- The large browse-card title now prefers `Listing.openingLine`, a safe sentence
  extracted from one of the PDFs in that exact listing. Seller-written teaser
  copy is only a fallback.
- The checkout confirmation uses the same title as the card.
- The detail sheet keeps the essay excerpt primary and labels any different
  seller-written teaser as `Seller's summary`.
- Newly submitted listings get an extracted opening even when the seller also
  supplied a teaser.
- The backfill now covers every approved listing without an opening, not only
  listings without teasers, and uses conditional writes so reruns are safe.
- Extraction now rejects prompt text with word limits, institutional prompt
  preambles, seller-name leaks, emails, phone numbers, account IDs, SSNs, and
  street addresses. PDF resale notices are removed before selecting a sentence.
- The approved real-data mock at `public/browse-mockup.html` was updated to put
  the essay-derived line before the teaser. That file remains gitignored and is
  not deployable.

## Verification completed

- `npm run test:opening-lines`
- `npm run test:listing-schools`
- `npm run test:commerce`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npx prisma validate`
- `npx tsc --noEmit`
- Direct `npx next build` with temporary build-only values.
- Visible Browser comparison of the approved `single-count` mock and the real
  app on port 3002. No checkout button was clicked.
- Multiple read-only production extraction audits. The first audit caught a
  pasted college prompt and a resale watermark; later audits drove fixes into
  the shared extractor rather than editing individual titles.

## Production write still requires approval

No database row has been changed. After the code is merged, run:

`node --env-file=.env scripts/extract-opening-lines.mjs --confirm`

That command fills `Listing.openingLine` only where it is still null. It does
not change essay files, prices, schools, approvals, seller data, or payments.
Fatimah must explicitly approve this live backfill before it is run.

The separate `Seller.currentUniversity` migration on
`codex/seller-university-integrity` also remains unpushed and still needs its
own explicit production-migration approval.
