# Handover: complete essay guide library

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `codex/complete-essay-guides`

Base: `origin/main` at `9702441`, after the Blog index and first Common App guide were merged.

Worktree: `/private/tmp/admitfolio-all-guides`

## Why this change

The Blog index displayed five useful guide topics as “Coming next.” Fatimah
asked for complete guides for every card while keeping the approved Admitfolio
Blog design. She then asked for one more guide about taking inspiration from
other students' essays without copying them.

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
- The Blog index and UC guide were visually checked at desktop and 390px mobile
  widths. No horizontal overflow or browser console errors were found.
- The local review is open at `http://127.0.0.1:3005/guides`.

## What is left

1. Get Fatimah's visual and editorial approval.
2. Push the branch and merge only after she asks.
3. Verify the six live article routes after Vercel deploys `main`.

No migration or backfill is needed.

## Unrelated workspace state

The original workspace has pre-existing edits for cards, the essay reader,
school naming, checkout previews, and other work. They were not touched or
staged. This guide work is isolated in the clean worktree above.
