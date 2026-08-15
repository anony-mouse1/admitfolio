# Handover: browse redesign + opening lines, as of 2026-08-12

Written when this work moved from Claude Code to Codex. Read `AGENTS.md` first
for the standing rules; this file is only the state of the work in flight.
Rewrite it, do not append to it.

## Where the code is

Branch `browse-redesign-and-opening-lines`, seven commits ahead of `main`.
Nothing is pushed, so GitHub and the live site are both unaffected by all of it.

Renamed from `add-seller-deletion-script` on 2026-08-14, which was the name of
its first commit only and said nothing about the rest. The branch had no
upstream, so the rename was purely local and nothing needs repointing.

`npx tsc --noEmit` is clean on the branch tip, and
`node scripts/name-leak.test.mjs` passes. That is the only test in the repo.

The commits, oldest first:

```
26b1bd2  Add a script for "delete my account" requests
edf16dd  Keep the browse mock-up files out of git
9ce6092  Resolve school names through lib/schools.ts, not substrings
ee96482  Add Listing.openingLine and a script to backfill it
be3e57c  Browse redesign: admit-school headline, detail sheet, sort, load more
dd4d50b  Point CLAUDE.md at AGENTS.md, and write down the handover process
fe10fb8  Never let a seller's own name become an opening line
```

## Not yet done to the live site

- **The `openingLine` migration has not been applied.** It applies by itself on
  merge to `main` (Vercel runs `prisma migrate deploy` before the build).
- **The backfill has never been run**, so every `openingLine` is NULL and the
  cards fall back to `teaser` exactly as they do today. Run
  `node scripts/extract-opening-lines.mjs` by hand after the merge. It is
  dry-run by default, it needs `--confirm` to write, and it writes to the live
  database, so read the dry run before confirming. Read finding 6 below first.
- `AI_REVIEW_MODEL=claude-sonnet-5` still needs setting in Vercel.

## What was done

1. **`take: 60` raised to 200** in the catalogue API. It had been hiding 84 of
   144 approved listings from buyers since 3 August, evicting the oldest visible
   listing on every new approval. See finding 5: this is a postponement, not a
   fix.
2. **`lib/schools.ts`**, 124 schools, ported from the mock-up. Unresolved school
   mentions went from 132 to 52.
3. **Card redesign.** Headline is the admit school, sub-line is the contents.
   Before: 31 cards were indistinguishable from another card by the same seller.
   After: 0.
4. **Tier fix.** `schoolTier` resolved `' penn '` inside "Penn State", pricing it
   as UPenn. Now resolves through `lib/schools.ts`. See finding 1: the blast
   radius is much wider than that one case.
5. **Sort control**, defaulting to most competitive, sharing one definition of
   selectivity with the price floors.
6. **Listing detail sheet.** Whole card opens it, `?listing=<id>` in the URL so
   links and the back button work, "Unlock and read" hands off to the existing
   buy modal. Built as JSX, not an HTML string: `Essay.question` is seller free
   text up to 1,201 characters and one missed escape would be stored XSS.
7. **Load more**, 24 at a time with scroll anchoring.
8. **Waitlist popup** no longer fires when `LAUNCHED`.
9. **`Listing.openingLine`** plus `scripts/extract-opening-lines.mjs`, which
   reads each seller's PDF out of Supabase Storage and recovers the first real
   sentence. Shown on the card only when the seller wrote no `teaser`, which is
   68 of 144 approved listings.

## Review findings

A review ran over the whole branch on 2026-08-12, roughly in severity order.
**Only finding 6 is fixed.** Everything else below is still open.

1. **The tier rewrite moves far more prices than the Penn State case it claims
   to fix** (`lib/pricing.ts:31`). `lib/schools.ts` only keys the long forms, so
   bare "Wisconsin", "Maryland", "Virginia", "Michigan", "Pittsburgh", "North
   Carolina", "Rochester", "Miami" and "Southern California" all fall tier 2 to
   tier 3, dropping the package floor from $30 to $20. "University of
   Washington" rises tier 3 to tier 2, which means
   `app/api/seller/listing-price/route.ts:47` now rejects a price that was legal
   when the seller submitted it: a $20 UW listing cannot save any edit until the
   price goes up. Verified by hand against `lib/schools.ts`. Fix by adding the
   bare forms as keys, and decide deliberately whether existing listings are
   regraded or grandfathered.
2. **The card headline promotes an unverified admit claim** (`app/page.tsx:2297`).
   `headlineSchool` takes an `admitTags` entry and gives it the card title and
   the school logo, but ignores `verifiedAdmitTags`, which the API already
   computes. A seller with no acceptance letter types "Harvard" and gets a card
   headlined Harvard with the Harvard favicon. This is the exact claim
   `AdmitProof` exists to check.
3. **The same unverified claim becomes the Stripe product name**
   (`app/api/checkout/route.ts:66`), so it lands on the buyer's receipt.
4. **Closing the detail sheet pushes history instead of going back**
   (`app/page.tsx:229`). Back re-opens the sheet you just closed, and each
   open/close adds two entries, so browsing five listings takes ten Backs to
   leave the page. Use `history.back()` or `replaceState`.
5. **`take: 200` re-creates the bug it documents, just later**
   (`app/api/listings/route.ts:38`). There is no cursor and no `hasMore`, and the
   new "Showing N of N" counter will claim it is showing everything, so at 201
   approved listings buyers silently lose the oldest again. Drop `take`, or
   return a total so the truncation is visible.
6. ~~**The extractor has no guard against a seller's own name inside the
   prose.**~~ **FIXED**, see `scripts/name-leak.mjs`. A candidate line holding
   the seller's name is now rejected and the next block is taken instead. It
   fires for every seller, not just the anonymous ones, because anonymity is per
   listing and can be changed later while `openingLine` is written once and
   never re-extracted. It is deliberately over-eager: a capitalised given name
   is rejected even where it is an ordinary word ("Grace slammed the door" goes,
   "she showed grace under pressure" stays). It only knows the name on the
   account, so a nickname or a sibling named in the prose still gets through and
   the dry run still needs a human. Covered by
   `node scripts/name-leak.test.mjs`.
7. **`chars` is measured before the page-2 fallback**
   (`scripts/extract-opening-lines.mjs:346`). A PDF whose first page is a
   text-free cover has its page-2 text built and then thrown away, and is
   counted as `noText`. Measure after the concat.
8. **The deletion script's verification cannot fail**
   (`scripts/delete-seller.mjs:163`). `storageList(...).catch(() => [])` turns a
   401 or a network error into an empty array, so `filesLeft` stays 0 and the
   script prints "Safe to send the confirmation email" having confirmed nothing.
   A failed check must report unknown.
9. **That verification only re-lists `listings/<id>`**
   (`scripts/delete-seller.mjs:160`). The admit-proof PDFs and the profile photo
   are deleted but never re-checked, so a partial failure leaving an acceptance
   letter (which carries the person's real name) in the bucket still reports
   "storage files left: 0".
10. **~35 lines of dead code in the card** (`app/page.tsx:2369`). `LINE_MAX`,
    `BETWEEN`, `tallyLabels` and `promptLineOf` are unreachable; `contentsLine`
    at line 2312 does its own de-duplication with different rules. It reads as
    live and will drift from what renders.
11. **The card shows all `admitTags` with no verified marker** while the sheet
    marks them with a tick (`app/page.tsx:2483` vs 2621). The card is what most
    buyers see, and `verifiedAdmitTags` is already on the client.
12. **"Accepted in:" on the card, "Admitted to" in the sheet**
    (`app/page.tsx:2481`), for the same data. Wrong preposition and inconsistent.
13. **The seller badge hardcodes `letter="V"`** (`app/page.tsx:2650`), so a
    seller who chose `full` anonymity gets their real name beside a "V"
    monogram. Use `displayName[0]`.
14. **The `Promise.withResolvers` polyfill runs after `pdfjs-dist` is evaluated**
    (`scripts/extract-opening-lines.mjs:31`), because ESM evaluates all imports
    before any module-level statement. It works only because pdfjs calls it at
    request time; the comment claims a protection that is not in force.

The `openingLine` migration itself is fine (additive, nullable, rollback-safe),
and the anonymity and `verifiedAdmitTags` additions to `/api/listings` do not
publish anything a buyer should not see.

## Still outstanding from the previous handover

- **`Listing.applicationSystem` was never added.** The wizard collects it
  (`app/page.tsx:605`) and `app/api/submit-listing/route.ts` still silently
  drops it. It was meant to be batched into the same migration as `openingLine`
  and was not, so adding it now costs a second migration.
- **No acceptance letter has ever been human-verified.** `verifiedAdmitTags` is
  empty on all 145 listings, so the verified badge can never appear even though
  the UI supports it. This is what makes findings 2 and 3 bite.
- **`Essay.wordCount` is null on all 384 essays**, so the sheet's word count
  never renders.
- **Teasers are hard-cut at 90 characters** in
  `app/api/submit-listing/route.ts`, 10 of them mid-word ("coding beca").
- **4 listings sit below their corrected price floor.** Nothing enforces floors
  retroactively.
- **There is no account-deletion path in the product.** Every request is a manual
  database operation via `scripts/delete-seller.mjs`.
- **4 listings are stuck out of the AI review queue** because their essay PDF was
  never uploaded. The cron only selects listings where every essay has a
  `pdfPath`, so they wait forever and show as "waiting on the AI".

## Verification

There is one test, and it is not wired to anything:

```
node scripts/name-leak.test.mjs
```

20 cases over the seller-name guard. It needs no database and no keys, which is
the point: `extract-opening-lines.mjs` connects to the live database at import
time, so anything left inside that file can only be exercised against
production. Split more logic out the same way when you need to test it.

Everything else is manual. UI work was checked by driving headless Chrome over
the DevTools protocol against `next dev`, asserting on the DOM. Those scripts
were lost with an ephemeral scratchpad; the approach is described in
`AGENTS.md`. If you write them again, put them in the repo.

Worth encoding as the regression test for the card work: no two visible cards
should share both their `.ecard-school` and `.ecard-meta` text.
