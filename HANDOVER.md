# Handover: checkout navigation and listing value panel

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch `ritvik/listing-value-panel`, PR #96. Merged current `main`, including
PR #89, after both branches were independently reviewed and tested.

## What changed

- PR #89 fixes checkout history so closing checkout returns to the surface that
  opened it and browser Back does not reopen the payment screen.
- PR #96 replaces the collapsed essay list with an always-visible "What you
  get" panel and makes clear that multi-essay packages are sold together.
- On phones, the price and Unlock button remain visible while the listing sheet
  scrolls. The optional production word-count work is not included.

## Verification

- TypeScript passed.
- Every pure `scripts/*.test.mjs` test passed on both reviewed branches.
- The checkout history verifier passed all 12 scenarios.
- The listing value verifier passed 432 checks across six real catalogue shapes
  at 390px and 1440px, with no overflow or clipped text.
- The visible desktop preview showed the complete Stanford nine-essay package,
  the sold-together wording, the included items, price, and Unlock button.

## What is left

PR #92 has additional privacy and server-side sanitization fixes under review.
PR #94 still conflicts with current `main` and its public trust claims require
copy corrections before it can merge.

No migration, backfill, production database write, or other hand-run deploy
step is required for PR #89 or PR #96.
