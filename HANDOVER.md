# Handover: complete essay guide library

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/complete-essay-guides`

Base: `origin/main` at `4471184`, including PR #48 Stripe-fee accounting and
PR #49 conversion analytics.

Worktree: `/private/tmp/admitfolio-all-guides`

## Why this change

The Blog index displayed five useful guide topics as “Coming next.” Fatimah
asked for complete guides for every card while keeping the approved Admitfolio
Blog design. She then asked for one more guide about taking inspiration from
other students' essays without copying them. After reviewing Studley's Blog,
she asked for its useful answer-first article structure on Admitfolio too.

## What changed

- Added a full UC PIQ guide covering prompt selection, all eight topic lenses,
  response structure, revision, and academic integrity.
- Added a practical guide to starting a college essay without forcing a hook.
- Added a research-based Why This College supplement guide.
- Added a college essay formatting and submission guide.
- Added a Common App word-count and revision guide.
- Added a guide to studying other students' essays for craft, with an
  inspiration loop and originality check.
- Gave every new page its own title, description, canonical URL, Open Graph
  article data, and Article structured data.
- Linked each Blog card to its finished article and replaced “Coming next” with
  “Read the guide.”
- Linked time-sensitive UC and Common App requirements to their official pages.
- Added three relevant internal guide links to every article so readers and
  search crawlers can move between related topics.
- Added a reusable article overview to all seven guides with a linked table of
  contents and a four-point summary before the main article.
- Added stable anchor IDs to every main section so the table of contents moves
  readers directly to the matching heading.
- Kept all writing original. Hypothetical examples teach structure without
  inventing accepted-student outcomes or reproducing seller essay text.

## Verification

- Prisma client generation completed locally.
- `tsc --noEmit` passed.
- Direct `next build` passed with harmless build-only placeholder values. No
  migration, database access, or production write ran.
- All seven guide cards have unique routes and all seven article routes are
  statically generated.
- Each article was opened locally and checked for its title, H1, canonical URL,
  Article structured data, and horizontal overflow.
- Related-guide cards were verified at desktop and 390px mobile widths. Every
  article has three internal recommendations and the cards stack on phones.
- Every article's table-of-contents link count matches its anchored section
  count. Every article has four summary points.
- A table-of-contents link was clicked in the local browser and correctly
  changed the URL hash and moved to its matching heading.
- The Blog index and UC guide were visually checked at desktop and 390px mobile
  widths. No horizontal overflow or browser console errors were found.
- The inspiration guide's table of contents and summary were visually checked
  at 390px. Both are readable and the page has no horizontal overflow.
- Latest `origin/main` merged into the guide branch. All code merged cleanly;
  only this handover note required a manual resolution.

## What is left

1. Push the merged branch to `main`.
2. Wait for Vercel production to become ready.
3. Verify all seven live article routes and the Blog index.

No guide migration or backfill is needed. The Stripe migration already on
`main` will continue to run through the normal Vercel build process.

## Unrelated workspace state

The original workspace has pre-existing edits for cards, the essay reader,
school naming, checkout previews, and other work. They were not touched or
staged. This guide work is isolated in the clean worktree above.
