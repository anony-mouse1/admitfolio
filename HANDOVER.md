# Handover: Fatimah's Guide cross-promo

Read `AGENTS.md` first. This records the completed review, merge, and live
verification of Ritvik's cross-promo work.

## Branch and base

Completion record branch: `codex/handover-crosspromo`

Base: `origin/main` at `a31c859`, the squash merge commit for PR #107.

## What changed

- A dismissible bottom banner now links Admitfolio visitors to the free
  consultation on Fatimah's Guide. It is excluded from `/admin` and
  `/purchase/*`.
- All eight essay guides now end with a Fatimah's Guide consultation card.
- The purchased-essay reading page and successful-checkout page now include a
  consultation prompt.
- Every link includes source, placement, campaign, and page-level UTM tags as
  applicable. Purchase-page links also suppress the referrer so a reading token
  cannot leak.
- Banner dismissal is stored locally in the visitor's browser. No customer or
  seller data is written.

## Verification completed

- Reviewed PR #107 and confirmed it was authored by Ritvik Bansal, was
  mergeable, and had a successful Vercel preview.
- Ran the complete 31-script test suite. All tests passed.
- Ran `tsc --noEmit` and `git diff --check origin/main...HEAD`. Both passed.
- Checked the Vercel preview and the live deployment in the visible browser.
- Confirmed production reports commit
  `a31c8590ed9c43dadc0f6028b000d5d7911a3df9` from `/api/version`.
- Confirmed the live homepage banner and the guide card both carry the expected
  UTM links and reach the `#consult` section on `fatimahs.guide`.

## Remaining work

- Open PR #106 adds a bottom privacy pill. Before merging it, adjust that pill
  to sit above the cross-promo banner when the banner is visible. PR #107 itself
  has no current production conflict.
- The original checkout at `/Users/fatimah/admitly-claude` remains untouched.
  It contains older unrelated local work and should not be committed wholesale.

No migration, backfill, database write, or manual production operation was
required.
