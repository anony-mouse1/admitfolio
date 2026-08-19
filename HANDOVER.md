# Handover: keep live Browse cards in sync with submitted essay content

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/fix-card-data-parity`

Base: `origin/main` at `394e335` (`Merge rollout handover update`)

## Root cause

The current card component already matches the approved Browse mock after a
hard refresh. The screenshots differed for two separate reasons:

1. The live browser tab had kept the pre-deployment JavaScript bundle. Changing
   only the URL hash does not reload an already-open Next.js application.
2. `Listing.openingLine` was added by migration, but its required production
   backfill was never run. Production currently has 68 approved listings with
   neither a seller teaser nor an opening line, and zero rows with a stored
   opening line. Their cards therefore fall back to a generic prompt label.

The exact $202 Cornell listing is `cmruelqtk0002zjx1gz0h1fc9`. The shared
extractor produces the approved mock hook: “Why’s it bleeding?” I asked,
staring at the red swirl in the sink.

## What changed

- The guarded PDF opening-line extractor is now reusable by application code
  and the maintenance script, so they cannot apply different safety rules.
- Both final upload review and human approval idempotently generate an opening
  line when the seller did not write a teaser. A failed or scanned PDF still
  falls back safely and never blocks approval.
- Existing openings from the same seller are excluded to avoid repeated hooks.
- A numbered school-specific prompt that the dry run exposed is now rejected
  before it can be published as essay prose.
- Deployed-build detection checks on focus and every five minutes. An old open
  tab now shows a clear `Refresh` notice after a new version ships.
- Regression coverage checks the prompt guard and verifies that both review and
  approval keep the extractor wired in.

## Verification completed

- Production read-only counts: 68 approved listings lack both teaser and
  opening line; zero listings currently have a stored opening line.
- Full read-only extraction audit: 64 safe candidates, one with no candidate,
  three skipped as duplicates, zero download failures, and ten scanned/no-text
  PDFs encountered while checking multi-essay listings.
- Every candidate was reviewed. One leaked school prompt was caught, the guard
  was strengthened, and the audit was rerun successfully.
- Exact read-only Cornell extraction matched the approved mock hook.
- `npm run test:opening-lines`
- `npm run test:listing-schools`
- `npm run test:commerce`
- `npm run test:purchase-fulfillment`
- `npm run test:seller-payouts`
- `npx prisma validate`
- `npx tsc --noEmit`
- Direct `npx next build` with temporary build-only environment values. No
  migration command was run.
- Visible local Browser QA against production-read data: 144 listings, twelve
  sampled cards all 415px high, zero overlaps, expected font loaded, and no
  browser console errors.
- Stripe checkout was not opened or clicked.

## Production step still required

The code has not yet been deployed and the backfill has not been written.
After the branch is merged and Vercel succeeds, run:

`node --env-file=.env scripts/extract-opening-lines.mjs --confirm`

That command writes only empty `Listing.openingLine` values. It requires
Fatimah's explicit approval because `.env` points to production. Then reload
Browse and confirm the $202 Cornell card and the catalogue hooks.
