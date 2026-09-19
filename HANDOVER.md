# Handover: legitimacy page

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch `ritvik/legitimacy-page`, PR #94. Current `main`, including PRs #89,
#92 and #96, was merged before final review.

## What changed

- Added a static `/legit` page, included it in the sitemap, and linked it from
  both footers, collection pages, and the checkout trust panel.
- Added a focused layout module and a browser verifier for the page at desktop
  and phone widths.
- Kept Organization JSON-LD on the shared, escaped structured-data helper.
- Corrected claims that the PR audit itself showed were unsupported. The page
  no longer says every seller uploaded an acceptance letter, promises delivery
  in under a minute, claims every submission was automatically screened, or
  announces an unapproved plagiarism-detection partnership.
- The page now states only what current code and reviewed records support:
  sellers confirm a `.edu` address, a person approves each published listing,
  automation does not publish alone, links are sent after payment, and the
  purchase-linked watermark helps trace redistributed copies.

## Verification

- Run TypeScript and every pure `scripts/*.test.mjs` test.
- Run `scripts/verify-legit-page.mjs` against a local server and browser at
  390px and 1440px.
- Inspect the visible page before merge.

## What is left

Review, push, merge, and verify `/legit` and the sitemap on production. No
migration, backfill, database write, or other hand-run deploy step is required.
