# Handover: Vercel analytics and review-cron hotfix

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/fix-review-cron`

Base: `origin/main` at `ccb5cd3`.

## What changed and why

- Vercel Web Analytics was enabled in the dashboard on the included plan. The
  production app already mounts the guarded `Analytics` component, so no code
  change was needed for tracking.
- `scripts/extract-opening-lines.mjs` no longer imports PDF.js statically.
  Vercel's server bundle could not load PDF.js's optional native canvas shim,
  so PDF.js constructed `DOMMatrix` while the route module was loading and
  crashed `/api/cron/review` before its handler ran.
- PDF.js now loads lazily after a small server-safe `DOMMatrix` value object is
  installed. Opening-line extraction only reads PDF text and never renders a
  canvas.
- The fix protects both `/api/cron/review` and `/api/upload-essay`, because both
  routes import the shared review runner.
- The regression test recreates the missing native canvas environment, loads
  PDF.js, generates a real PDF, and verifies that its text can be extracted.

## Verification completed

- `node scripts/opening-line.test.mjs` with Node 20.19.4
- `npx tsc --noEmit` with Node 20.19.4
- Direct `next build` with temporary build-only environment values. No migration
  or production database write ran.
- Both compiled route bundles import successfully with `DOMMatrix` absent and
  PDF.js's native canvas bridge unavailable.
- Vercel Analytics changed from demo data to the live dashboard with zero as
  its initial count.

## What is left

- Commit and push the focused hotfix.
- Merge it to `main`, because Vercel deploys only `main`.
- Monitor the production deployment.
- After the next five-minute cron tick, verify `/api/cron/review` no longer
  returns `DOMMatrix is not defined` and confirm real Analytics events begin to
  appear after production visits.

No migration, backfill, or manual production database write is required.
