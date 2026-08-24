# Ritvik seller-flow fixes

This checklist is the source of truth for the seller-flow work prompted by
Ritvik's August 2026 feedback. An item is complete only after its production
code and focused tests are complete. A mockup alone does not complete an item.

## Task 1: Isolated implementation workspace

- [x] Start from the latest `origin/main` in `codex/ritvik-seller-flow`.
- [x] Keep the existing dirty working tree untouched.
- [x] Record every seller-flow task in this file.

## Task 2: Prevent duplicate accounts and unsafe password changes

- [x] Treat normalized email addresses as one identity.
- [x] Reject signup when a seller already exists.
- [x] Never change an existing password through signup or listing submission.
- [x] Route existing sellers to login or explicit password recovery.
- [x] Purpose-scope and single-use email verification for signup and reset.
- [x] Enforce password rules on the server.
- [x] Add focused regression tests.

## Task 3: Separate seller account creation from essay submission

- [x] Add a dedicated seller signup endpoint.
- [x] Create the seller session before essay work begins.
- [x] Allow an account with no listings.
- [x] Remove seller creation from listing finalization.
- [x] Update the seller UI to support account-first onboarding.
- [x] Add focused regression tests.

## Task 4: Resumable drafts, autosave, and staged uploads

- [x] Add seller-owned application draft records.
- [x] Add private staged-file records and ownership checks.
- [x] Autosave structured fields with retry-safe updates.
- [x] Upload files before final submission and retain stable asset IDs.
- [x] Restore structured fields and staged-file references in a new authenticated session.
- [x] Add the visible resume banner immediately after page refresh or Back.
- [x] Finalize idempotently only after all required assets validate.
- [x] Send submission email only after successful finalization.
- [x] Add non-destructive orphan retention rules (30-day stale drafts become recoverable `abandoned` drafts; no files are deleted).
- [x] Add focused regression tests for draft ownership, conflicts, staged files, and finalization.

## Task 5: Reusable profile and multi-school Applications workspace

- [x] Store reusable seller education/profile defaults.
- [x] Build one profile with repeating school application groups as an isolated production component.
- [x] Integrate the Applications workspace with the live seller dashboard view model.
- [x] Reuse eligible verified admission proofs.
- [x] Prefill common application metadata without copying anonymity choices.
- [x] Preserve `Listing` as the purchase unit.
- [x] Never expose a seller ID or cross anonymity boundaries publicly.
- [x] Add focused component regression tests.
- [x] Complete responsive browser checks after dashboard integration (1440px and 390px, zero horizontal overflow).

## Task 6: Editable resubmissions and listing/outcome controls

- [x] Let sellers edit rejected or removed submissions before resubmitting.
- [x] Preserve finalized assets already purchased by buyers.
- [x] Separate shared school outcome details from individual essay listing rows.
- [x] Keep buyer-visible outcome wording limited to verified claims.
- [x] Keep anonymity authoritative per listing.
- [x] Add focused regression tests.

## Task 7: Complete in-app verification workflow

- [x] Scope listing review jobs to only the proofs claimed by that listing.
- [x] Version each proof so every verification job targets one immutable version.
- [x] Clear stale AI and pending-listing review results after re-upload.
- [x] Add immutable verification runs and human decision history.
- [x] Show pending, verified, and rejected status to sellers.
- [x] Let sellers replace rejected proof inside the dashboard.
- [x] Gate verified outcome claims on the relevant approved proof.
- [x] Keep AI advisory and human review authoritative for risky cases.
- [x] Add focused regression tests.

## Task 8: Production university-logo cleanup

- [x] Replace remote university CDN and Google favicon URLs.
- [x] Move production marks out of `mockup-assets`.
- [x] Use one self-hosted school-logo manifest everywhere.
- [x] Center each mark consistently in its badge.
- [x] Keep a monogram fallback only for unsupported schools.
- [x] Record source and permitted-use metadata.
- [x] Add focused regression tests.

## Task 9: Full verification

- [x] TypeScript passes.
- [x] Auth and duplicate-account tests pass.
- [x] Draft, upload, retry, and idempotency tests pass.
- [x] Seller applications and responsive UI checks pass.
- [x] Verification and proof-version tests pass.
- [x] Logo asset tests pass.
- [x] Existing anonymity, commerce, fulfillment, payout, and school tests pass.
- [x] Production build passes without applying a live migration.

## Task 10: Production handoff

- [x] Review database migration SQL without applying it to production.
- [x] Produce read-only impact reports for normalized-email collisions and
      legacy verification state.
- [x] Document that no legacy inference backfill or destructive cleanup is included.
- [x] Review deployment risk and merge the focused change into `main`.
- [x] Obtain explicit approval before production migrations, merge, and
      deployment.
