# Handover: school name resolution fixes

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/fix-school-resolution`, on `origin/main` at `14d0026` (#84).
Open as PR #86 against `main`, not merged. Nothing else is in flight.

## Why

Seven seller-typed school names resolved to a different and more selective
institution than the seller was admitted to, and that wrong name is on the
"Accepted at" line of a live listing today. A seller admitted to UMass Amherst
was published as an Amherst College admit. On a site whose whole claim is
verified admits, that is the worst kind of wrong.

Found while sizing canonicalisation for SEO collection pages, by running the
real `schoolInfo` over all 279 distinct admit strings in the public
`/api/listings` response. The seven were never reported by a user, because
nothing on the site shows a seller what their own admit resolved to.

## What changed

Three files.

- `lib/schools.ts`: eight new table entries and eleven amended ones. **The
  resolution logic is untouched.** `schoolInfo`, `normalize`, `sameSchool` and
  `titleCase` are byte for byte what they were.
- `scripts/listing-school.test.mjs`: the seven corrections, the eighth
  preventative one, seventeen "must still resolve to itself" guards for the
  schools they used to be mistaken for, six `sameSchool` pairs that must now
  come apart and three that must still match, and the pinned Duke Kunshan
  decision.
- `scripts/university-rank.test.mjs`: the nine aliases, the exactKey guards for
  UI Chicago and UMass Boston, and the national ranks the wrong resolutions used
  to borrow.

Not touched: `app/page.tsx`, `lib/pricing.ts`, `lib/admitProof.ts`,
`lib/schoolLogos.ts`, anything under `prisma/`, any dependency. Ritvik's
uncommitted `.gitignore` change is his and was left unstaged.

### The two causes

A short key matching inside a longer name. `'amherst'` (`lib/schools.ts:98`)
matched inside " umass amherst ", `'dartmouth'` (`:60`) inside " umass
dartmouth ", `'washington university'` (`:75`) inside " george washington
university ".

Longest-match handing a campus to its own system's flagship. `'university of
north carolina'` is 28 characters and out-ranked `'north carolina charlotte'` at
24 and `'north carolina greensboro'` at 25. So `"...at Charlotte"` resolved
correctly and `"...Charlotte"` did not. Same shape for `'university of maryland'`
(22) inside the full UMBC name.

### The two mechanisms used, both already in the file

Longest-key-wins for anything colliding with a longer existing key:
`'george washington university'` (28) now out-ranks WashU's 21, and
`'university of north carolina charlotte'` (38) out-ranks UNC's 28. This is what
the file already did for the UT campuses (`:126-128`).

`exactKeys` for bare names that must never match inside a longer string:
`umass`, `bu`, `ucm`, `university of illinois`. The last one is load-bearing. As
an ordinary key `'university of illinois'` (22) would out-rank UI Chicago's
`'illinois at chicago'` (19) and swallow that campus.

## Decisions already made, do not reopen

- **`Duke Kunshan College` stays resolving to Duke.** It has the same shape as
  the seven (Duke Kunshan University is a separate degree-granting school in
  Kunshan, China, and `'duke'` matches inside it), so that listing inherits
  Duke's tier 1 floor, Duke's #7 catalogue rank and Duke's logo. Ritvik decided
  not to change it here: splitting it lowers what a live listing claims, which
  is Fatimah's call. Pinned in `listing-school.test.mjs` so it stays visible.
- **The abbreviations `gwu`, `GWU`, `umass` and `UMBC` are included**, though
  they were on the "52 schools genuinely absent, do not add" list.
  `gwu.edu`, `umass.edu` and `umbc.edu` enter the table anyway to fix the full
  spellings, and an entry that resolves "George Washington University" but not
  "GWU" is exactly the inconsistency the nine alias additions exist to remove.
  Affects 4 listings.
- **UNC Wilmington's no-"at" key is included** even though no listing uses it
  yet. Identical hole to its two sibling campuses, one key, closed before a
  seller falls into it.

## Verification completed

- Ran the resolver before and after over **388 school strings**: all 279 distinct
  admit strings from the live `/api/listings`, every `school`, `targetSchool` and
  `headlineSchool` in the catalogue, all 128 `SCHOOL_OPTIONS`, and a hand-built
  guard corpus. **24 resolutions changed, 364 unchanged, all 24 intended.**
- Penn State guard holds. All four Penn State spellings still `psu.edu`, all six
  UPenn spellings still `upenn.edu`, Penn State still has no rank.
- Every assertion already in both suites passes unchanged. The at-risk families
  hold: UI Chicago, Illinois Tech, UMass Boston, Amherst College, Dartmouth
  College, WashU in three spellings, University of Washington, UMD College Park,
  UNC Chapel Hill, NC State, Duke, Boston College.
- The new assertions were run against the **unfixed** `lib/schools.ts` and fail
  there, so they genuinely bite rather than restating current behaviour.
- `npx tsc --noEmit` clean. All 27 `test:*` scripts pass. `npx next build`
  succeeds. Never `npm run build`; it applies migrations.
- Price floors: five listings change `admitsTier`, every floor **falls**, and no
  listing sits below a new floor.
- Submit validation: all 100 listings with a `targetSchool` still have it matched
  by one of their own admits. Zero flips.
- No database write, migration, backfill or script. The only read was the
  unauthenticated public `GET /api/listings`.

### One bonus fix

A seller admitted to NC State, UNC Chapel Hill, UNC Charlotte and UNC Greensboro
currently shows **two** admits, not four. Three of the four resolved to
`unc.edu`, so `collegeAdmitTags` (`app/page.tsx:3936`) de-duplicated them. All
four now show.

### One cost

Eight of the touched domains have no mark in `lib/schoolLogos.ts`, so they get
the monogram letter badge. Today "UMass Amherst" shows the *Amherst College*
logo, so this trades a wrong logo for a letter. The most visible card is a UMBC
seller whose headline reads "Maryland" with Maryland's logo today and becomes
"UMBC" with a monogram. `illinois.edu`, `bu.edu`, `temple.edu` and
`ucmerced.edu` already have marks and gain them.

## What is left, and whose it is

1. **Fatimah: review and merge PR #86.** `git push` does not deploy; Vercel
   deploys `main`.
2. **Fatimah: decide on Duke Kunshan.** One listing. Split it to its own entry,
   or leave it claiming Duke.
3. No hand-run step. No migration, no backfill, no data change of any kind. The
   fix is pure resolution, so it takes effect the moment the deploy lands.

## Found but not fixed

- **`lib/admitProof.ts:50-58` has a second normalizer**, `schoolKey`, whose own
  comment at `:43-48` says to replace it with `schoolInfo(name)?.domain ??
  schoolKey(name)` once `lib/schools.ts` landed. It has landed. **Do not do this
  as a code-only change.** `schoolKey` is a persisted database key:
  `AdmitProof.schoolKey`, unique on `(sellerId, schoolKey)`
  (`prisma/schema.prisma:61,78`, migration `20260802090000_add_admit_proof`).
  Switching the function changes what new rows write while every stored row keeps
  the old value, and every lookup would miss: `sellerId_schoolKey` in
  `submit-listing/route.ts:255` and `seller/proofs/route.ts:111`, the
  `schoolKey: { in: ... }` queries in `drafts/[id]/finalize/route.ts:108` and
  `lib/reviewRunner.ts:85`, and the maps in `lib/sellerDashboardView.ts:169` and
  `admin/listings/route.ts:77`. Every seller's uploaded acceptance letter would
  read as missing, sellers would be asked to re-upload letters they already sent,
  and the admin console would show verified claims as unverified.

  Shape of it, measured on the 279 public admit strings as a proxy (the real
  count needs a database read of `AdmitProof`, which was not done): today's
  normaliser produces **227** distinct keys, the switch would produce **159**,
  and **230 of the 279 strings would change key value**. That is the backfill.
  `AGENTS.md` is explicit that Vercel does not run backfills.

  The benefit is real: it is what finally collapses "UC Berkeley" and
  "University of California, Berkeley" into one acceptance letter instead of two.
  The long-term hazard is worth weighing first. `schoolInfo` returns null for
  the 56 institutions the table does not know, so the fallback keeps text keys
  and the column becomes a **mixed key space**. After that, every future addition
  to `lib/schools.ts` silently changes the key for that school and orphans its
  proofs again. This PR adds seven domains and would have done exactly that.
  Worth solving once, with a migration that stores the resolved domain and a
  reconciliation step, rather than switching the function and hoping.

- **`scripts/pricing.test.mjs` and `scripts/name-leak.test.mjs` are not wired
  into `package.json`.** Both pass when run by hand (`node scripts/...`). Nothing
  runs them today, so the 27 `test:*` scripts are not the whole suite. The price
  tier is a pure function of the resolved domain, so pinning the domain in the
  wired suites covers this PR's regression surface, but `test:pricing` should
  probably exist.

- **The seller school picker offers 13 labels the resolver cannot parse.**
  `SCHOOL_OPTIONS` is built from each entry's `short` (`lib/schools.ts:208-212`),
  and a `short` is not automatically a key. A seller who picks "Florida",
  "Indiana", "Minnesota", "Alabama", "Arkansas", "Delaware", "Houston", "Illinois
  Tech", "Oklahoma", "Rhode Island", "UI Chicago", "USF" or "Wentworth" from the
  datalist gets an unresolved school with no logo and the tier 3 floor. Was 15
  before this PR, which repaired "LMU" and "Temple". Latent: no current listing
  is affected. The fix is either a key per `short` or a test asserting every
  `SCHOOL_OPTIONS` entry resolves.

- **`fordham.edu` and `tcd.ie` have logo assets in `lib/schoolLogos.ts` but no
  entry in the SCHOOLS table**, so those two marks can never render. Fordham is
  3 listings, Trinity College Dublin is 1.

- **56 institutions in the live catalogue still resolve to nothing**, deliberately
  out of scope here. They are a long tail of one-off schools (Fordham, Barnard,
  Connecticut College, Occidental, Wellesley and 51 more), not variants of the
  big ones. Separate data question.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Next 16.3's dev server still appends a generated block to
`AGENTS.md` on every `npx next dev` start; check `git status` for it before any
commit. It was not triggered by this work, which never started the dev server.
