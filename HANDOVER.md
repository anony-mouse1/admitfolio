# Handover: the checkout Back button

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch `ritvik/checkout-back-button`, PR #89. Rebased onto `main` at `a18fce4`,
after #93, #95 and #97 merged.

## Why

Closing checkout pushed a history entry where closing the detail sheet pops one.
A visitor who unlocked a listing, closed checkout and pressed Back went forward
into the payment screen they had just left.

## What changed

- `closeBuy` pops the entry `openBuy` pushed instead of pushing a new one.
- A checkout opened straight from a card returns to the catalogue, not to a
  listing sheet that was never opened. The control says "Back to essays" on that
  path and "Back to listing" on the sheet path.
- A pasted `?checkout=` link has nothing to pop, so closing it replaces rather
  than pushes.
- `scripts/verify-checkout-history.mjs` drives Chrome over the DevTools protocol
  and attributes every history write to its caller.

## Retest after the rebase, 2026-09-19

Re-run from scratch against `main` at `a18fce4`. Nothing is carried over from
the run recorded before the rebase.

- 12 of 12 scenarios pass at 1440, and 12 of 12 at 390. The suite is run twice,
  once at each width, so every scenario is exercised at both rather than only
  the mobile pill scenario.
- The desktop viewport in the script moved from 1280 to 1440, the width this
  project reviews against.
- First paint, before any JavaScript runs, checked by reading the served HTML
  directly. A collection page at `?checkout=` serves the overlay already open
  with the pill reading "Back to listing", and at `?listing=` serves the sheet
  with the overlay closed. The homepage serves neither at either URL, which is
  the known client-rendered homepage limitation and not something this branch
  introduces or can fix.
- One scenario aborted once on the first run with "Not attached to an active
  page", a CDP detach rather than a product failure. It passed on every re-run
  at both widths.

## The bug on main, still present

Measured, not assumed. The same script against `main` at `a18fce4` fails
**25 checks at 1440 and 25 at 390**.

Every one of the 25 is a homepage scenario. The three collection-page scenarios
pass on `main`, because #88 already fixed that path when it merged. What is left
for this branch to fix is the homepage only:

- The card path labels itself "Back to listing" when no listing sheet was ever
  opened.
- The in-page back link, the x, Escape and the mobile pill each land three
  entries deep instead of back where the visitor came from, and each leaves
  `?listing=` on a path that never had a sheet.
- A Back after any of those four goes forward into `?checkout=`, which is the
  original complaint.
- Closing a pasted `?checkout=` link pushes instead of replacing.

## Verification

- `npx tsc --noEmit` clean.
- All 28 `test:*` scripts pass.
- The history verifier needs a running dev server and a Chrome started with
  `--remote-debugging-port`. It is not in `package.json` and not eligible for
  `test:*`, which is pure.

## What is left

Review and merge. No migration, backfill, database write or hand-run deploy step.
