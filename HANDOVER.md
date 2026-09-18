# Handover: structured data, llms.txt, and checkout email validation analytics

Read `AGENTS.md` first. This file records the current work in flight.

## Branch and base

Branch `ritvik/structured-data-and-llms-txt`, PR #97. Merged `main` after
PR #95 at `54ae0a9` before final review.

## What changed

- Added an Organization JSON-LD block to the homepage and ItemList blocks to
  `/essays` and its six collection pages. The lists are built from the same
  items those pages render; there are no Product or Offer claims.
- Added `/llms.txt` from the existing collection and guide registries.
- Added a `Checkout Email Invalid` analytics event without sending the email
  address or changing the Stripe mount path.
- Escaped `<` in JSON-LD before embedding it in a script element. A listing
  title can contain seller-authored text, so plain `JSON.stringify` was not
  safe. A regression test uses a script-closing title and checks that the
  serialized result cannot break out of the element.
- Qualified the llms.txt description where some legacy listings do not have
  a confirmed target application.

## Verification

- TypeScript and all `scripts/*.test.mjs` files pass after the review fix.
- A direct `next build` and the live route verifier must pass before merge.
- No database write, migration, backfill, or hand-run deploy step is required.

## Remaining

Wait for a fresh Vercel check, merge PR #97, then verify the structured data,
llms.txt, and main deployment on production. PRs #89, #92, #94, and #96 are
separate review decisions; this branch does not alter them.
