# Handover: cache the essay collections hub

Read `AGENTS.md` first. This file records the current work in flight.

## Branch and base

Branch: `ritvik/cache-collection-pages`, based on `main` at `3e88554`, and
opened as PR #91.

## Why

The `/essays` hub was rendered dynamically on every request even though its
content can tolerate a short cache window. This made it slower for readers and
crawlers without improving correctness.

## What changed

- `/essays` now uses a five-minute revalidation window.
- Individual `/essays/[collection]` pages remain dynamic so a newly approved
  listing appears there immediately.
- `scripts/verify-collection-cache.mjs` verifies the cache split and checks that
  every collection page matches the current public catalogue.

## Verification completed

- `npm run lint` passes.
- All 28 `scripts/*.test.mjs` files pass.
- A direct `next build` passes. `/essays` is prerendered with a five-minute
  revalidation window; collection pages remain dynamic.
- The cache verifier passes against the local production build.
- The cache verifier fails against the current production deployment because
  the change is not live there yet, which confirms that it detects the behavior
  it is meant to guard.
- Vercel's PR deployment check passes.

## What is left

Merge PR #91. No migration, backfill, database write, or other hand-run deploy
step is required.

## Found but not fixed

- The Vercel preview deployment is protected by Vercel authentication, so the
  public cache verifier cannot inspect that URL without a bypass token. The
  deployed build itself passed Vercel's check, and the same commit was verified
  locally as a production build.
- The repository's dependency audit reports one high and one critical advisory.
  They predate this cache-only PR and should be handled separately after checking
  for breaking upgrades.
