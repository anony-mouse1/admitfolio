# Handover: server-rendered essay collection pages

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/collection-pages`, on `origin/main` at `2ceeb7e` (#85).
Open as PR #87 against `main`, not merged. Nothing else is in flight.

## Why

Google has never seen a listing. The public site is one client-rendered page, so
a crawler without JavaScript gets `Loading essays…` and no catalogue at all,
against 192 live listings. Seven server-rendered pages put those listings in the
HTML. This is recommendation 1 of the buyer acquisition audit.

## What changed

Twenty-eight files. Most of them are one extraction and the tests that were
anchored to the old locations.

**The catalogue query moved.** `lib/publicCatalog.ts` holds what was the body of
`app/api/listings/route.ts`, so the pages and the JSON API serve the same
listings from the same code. The launch gate moved with it and sits immediately
before the query, so every reader inherits it. The API response is unchanged,
verified byte for byte against production twice.

**The browse card moved.** `lib/publicListing.ts` holds the type and the pure
helpers, `components/ListingCardBody.tsx` the markup. The homepage wraps it in
the clickable div it always had; the collection pages wrap it in an anchor. One
body, so the two cannot drift. `components/ListingDetail.tsx` and
`components/ListingCheckout.tsx` came out of `app/page.tsx` the same way, which
is what lets a collection page open a listing and take a payment without
sending the buyer to the homepage. `app/page.tsx` is 500 lines smaller.

**Seven new pages.** `/essays` plus six collections, listed in the table in the
PR. `lib/collections.ts` is the one registry the hub, the pages, the metadata
and the sitemap read. Membership is by prompt or by major, never by seller and
never by school.

**The homepage.** A collections band of six cards above Featured essays, which
drops to three; Featured's selection logic is untouched. A canonical tag, because
the card links make `?listing=` crawlable and every one of those serves the
homepage. `metadataBase` and an OpenGraph card, neither of which existed.

## Decisions already made, do not reopen

- **Collections is in the shared nav but not the homepage's.** The homepage has
  the band, which is a better entry point; guides and collection pages have no
  band, so the nav is their only route. Removed from all three homepage
  surfaces (nav bar, tablet menu, mobile menu), left in `GuideShell` and in both
  footers.
- **The card href points at the collection, not the homepage.** Following it
  lands on the collection with the sheet open, so a crawler, a middle click and
  a shared link all arrive somewhere that makes sense.
- **Checkout runs on the collection page.** `components/ListingCheckout` is one
  implementation with two mounts, not a second copy of the payment path.
- **`otherListingIds` is stripped before the listings reach the client.**
  Handing them to a client component serialises every field into the RSC payload
  inside the HTML, and that field is an exact same-seller grouping. The sheet's
  sibling block therefore never renders on a collection page.
- **Biology is 30, not 31.** The 31st was a listing whose majors read "Chemical
  and Biomolecular Engineering, Bioengineering, Biomedical Engineering", caught
  by a looser pattern on the substring `biomolecular`.
- **The stats band is full width, below the grid on mobile.** Beside the intro,
  whichever was shorter left a hole, and the intro length varies per collection.
- **Duke Kunshan stays resolving to Duke.** Pinned in
  `scripts/listing-school.test.mjs`. Splitting it lowers what a live listing
  claims, which is Fatimah's call.

## Verification completed

- `npx tsc --noEmit` clean. All 27 `test:*` scripts pass. `npx next build`
  succeeds. Never `npm run build`; it applies migrations.
- Headless Chrome over CDP at 1440, 820 and 390, on ten surfaces, in served HTML
  and after hydration. Every collection serves its full card count as crawlable
  anchors, a click never navigates, Back returns to the collection at the scroll
  position it left, checkout opens and closes on the collection's own URL, and
  `otherListingIds` appears in none of the six pages.
- Six test scripts re-anchored, none weakened, about twenty assertions added,
  each checked by breaking the thing it guards.
- No database write, migration, backfill or script. The only reads were the
  unauthenticated public `GET /api/listings` and the app's own.

## What is left, and whose it is

1. **Fatimah: review and merge the PR.** `git push` does not deploy; Vercel
   deploys `main`.
2. **Fatimah: the nav word.** She does not want "Collections". Three options
   were put to Ritvik with reasoning and she has not answered. When it changes
   it needs changing in nine code locations plus the copy strings: the shared
   nav and its mobile menu, both footers, the breadcrumb on the hub and all six
   collections, the band's closing pill, the hub H1, title and description, and
   all six collection `title`/`description` strings in `lib/collections.ts`,
   plus three assertions in `scripts/sitemap.test.mjs`. The URL `/essays` needs
   no change under any of the options.
3. **Fatimah: Duke Kunshan.** One listing. Split it to its own entry or leave it
   claiming Duke.
4. No hand-run step. No migration, no backfill.

## Found but not fixed

- **Eleven cards show a monogram instead of a logo**, because those schools have
  no artwork in `lib/schoolLogos.ts`: LMU, Georgetown, Clemson, Syracuse, Notre
  Dame, UMBC, Harvey Mudd, Barnard, Bryn Mawr, St Mary's College of Maryland and
  Trinity College Dublin. Adding one means sourcing a trademarked mark and
  recording its provenance in `public/assets/schools/SOURCES.md`, so it is not a
  file drop. Trinity College Dublin and Fordham are the cheap two: both already
  have an asset and are simply missing from the `lib/schools.ts` table.
- **`.nav-links` is `display: none` below 900px**, so every top-level nav item
  lives behind the burger on mobile. Entirely pre-existing. It is what caused the
  Collections link to ship invisible on phones before it was caught.
- **`scripts/pricing.test.mjs` and `scripts/name-leak.test.mjs` are not wired
  into `package.json`.** Both pass when run by hand, so the 27 `test:*` scripts
  are not the whole suite.
- **The seller school picker offers 13 labels the resolver cannot parse**
  (`Florida`, `Indiana`, `Minnesota`, `UI Chicago` and others). `SCHOOL_OPTIONS`
  is built from each entry's `short`, and a `short` is not automatically a key.
  Latent: no current listing is affected.
- **`/privacy` and `/terms` still have no canonical.** Separate item, already
  raised with Fatimah.
- **`lib/admitProof.ts` still has its second normalizer.** Swapping `schoolKey`
  for `schoolInfo` needs a backfill or every stored acceptance letter is
  orphaned. Detail is in the PR #86 description.
- **A collection page has no pagination, no back-to-top and no filter.** The
  Common App page is 18 screens on desktop. Deliberate for crawlability, and a
  design conversation rather than a bug.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Next 16.3's dev server appends a generated block to `AGENTS.md` on
every `npx next dev` start; check `git status` for it before any commit. Ritvik's
uncommitted `.gitignore` change is his and was left unstaged.

Two gitignored mock-ups under `public/` hold real seller data and must never be
committed or deployed: `collections-entry-mockup.html` and
`homepage-collections-mockup.html`.
