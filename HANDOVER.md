# Handover: launch security hardening

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/launch-security-hardening`

Base: `origin/main` at `37e7f21`.

Worktree: `/private/tmp/admitfolio-launch-hardening`

The main worktree had unrelated uncommitted changes, so this work was isolated
in a separate worktree and did not alter them.

## What changed

- Upgraded `pdfjs-dist` to patched version `6.2.108`, pinned the required Node
  runtime to 22.13 or newer, refreshed both vendored browser assets, and updated
  the PDF.js loading-task cleanup used by opening-line extraction.
- Made submitted essay PDFs immutable. Old upload tokens cannot replace an
  existing, reviewed, in-review, approved, or otherwise non-pending file.
  New uploads use content-hash-prefixed unique storage paths with overwrite
  disabled.
- Added server-side launch checks to both `/api/listings` and `/api/checkout`.
  When `NEXT_PUBLIC_LAUNCH` is not `1`, neither inventory nor checkout can be
  reached by bypassing the client UI.
- Added a screen-reader-only text representation for every purchased PDF page.
  Visual canvases are now hidden from assistive technology.
- Added an enforced Content Security Policy plus clickjacking, MIME sniffing,
  referrer, browser-permission, and cross-domain-policy headers. The CSP keeps
  the Stripe Checkout, Vercel analytics, PDF worker, and Google Font origins
  needed by the current app.
- Removed the seller payout split paragraph from the Terms. Updated the Terms
  and Privacy Policy for live purchasing, removed dead contact-page references,
  disclosed admission-proof collection and Anthropic review, and replaced the
  unsupported 24-month access-log promise with an accurate purpose-based
  retention statement.
- Added `test:launch-hardening` regression coverage.
- Upgraded Next.js from 14.2.5 to 16.3.2 and React from 18.3.1 to 19.2.8,
  migrated App Router route and page parameters to the required async API, and
  replaced the removed `next lint` command with the existing TypeScript check.

## Database and production changes

None. There is no migration or backfill. No production data, Stripe session,
payment, seller record, or deployed environment variable was changed.

## Verification

- Prisma Client generation
- `tsc --noEmit`
- All 25 `*.test.mjs` files
- Production `next build` with build-only placeholder values and without
  running `prisma migrate deploy`
- Fresh npm audit confirmed the PDF.js advisory is gone
- A fresh production dependency audit reports zero known vulnerabilities
- Local production responses confirmed both launch-gated APIs return 503 before
  database or Stripe access when launch is off
- Local production responses confirmed CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`
- Visible Terms and Privacy checks at 1280px and 390px with zero horizontal
  overflow

## What is left

- Merge and deploy this branch. Production has not changed yet.
- After deployment, verify the live security headers and exercise one existing
  paid-reading link to confirm the patched worker and accessible text load with
  real purchased content. Do not create a payment for this check.
- Legal wording should still receive counsel review before it is treated as
  legal advice or a complete compliance determination.
