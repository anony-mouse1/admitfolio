# Handover: sitemap and robots.txt, the first SEO change

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/add-sitemap-robots`, on `origin/main` at `e3ae55d` (#82).
Open as a pull request against `main`, not merged. Batches 1 to 5 (#75 to
#81) are all on `main`; nothing from them is in flight.

## Why

Google Search Console knows three URLs on the whole domain: `/`, `/privacy`
and `/terms`. The blog index and all seven guide articles are "URL is unknown
to Google", with no crawl ever attempted and no referring sitemap. Eleven good
pages exist. This branch makes the other eight findable. Nothing new is written.

## What changed

**The guide list is now one registry, `lib/guides.ts`.** Before this, each
guide's slug, category, dates and read time were written in four places: the
index card in `app/guides/page.tsx`, the article's OpenGraph and JSON-LD
metadata, the byline and pill under its title, and the map in
`components/RelatedGuides.tsx`. They agreed only by care. The sitemap needs one
authoritative source, so the index, the seven articles and `RelatedGuides` all
read from the registry now. Slugs are literal types, so an article that names
an unknown slug fails `tsc`. To add a guide: create `app/guides/<slug>/page.tsx`,
add one registry entry, and the index, the related cards and the sitemap pick it
up. `npm run test:sitemap` fails if either half is missing.

**`SITE_URL` moved to `lib/site.ts`** beside the other public constants, with
`PRODUCTION_SITE_URL` as its fallback. `lib/stripe.ts` re-exports it, so the
eight API routes importing it there are untouched. The guide canonicals now
derive from `SITE_URL` instead of a literal. Production resolves it to
`https://admitfolio.com`, verified without a write: a cookie-less GET to
`/api/seller/connect/refresh` redirects to `${SITE_URL}/?login=1`.

**`app/sitemap.ts`** lists exactly eleven URLs: `/`, `/guides`, the seven
guides, `/privacy`, `/terms`. Each guide carries the `modified` date the
article itself declares. `/guides` carries the newest of those. The homepage,
privacy and terms carry no date because none exists, rather than a build
timestamp that would tell Google every page changed on every deploy. No
priority, no change frequency.

**`app/robots.ts`** allows `/` and `/api/listings`, disallows `/admin` and
`/api`, and names the sitemap. `/purchase` is deliberately crawlable: those
pages are noindex and a robots block would stop a crawler from ever reading
that. `/api/listings` is re-allowed because the homepage renders its catalogue
from it on the client and Googlebot obeys robots.txt for the fetches a page
makes while rendering.

**`crawlOrigin()` in `lib/site.ts`** refuses to publish either file with
anything but the apex on the production deployment (`VERCEL_ENV=production`),
so a misconfigured `NEXT_PUBLIC_SITE_URL` fails that build and leaves the old
site up. Local builds and previews render whatever origin they were given.
Vercel does expose system env vars at build time here: the
`admitfolio-build` meta tag in the served HTML carries the real commit sha.

**Read times corrected.** Every label overstated its article, one by more than
three times. Recounted from the rendered production pages, table of contents
included, at 225 words a minute and rounded to the nearest minute:

| Guide | Words | Was | Now |
|---|---|---|---|
| how-to-take-inspiration-from-college-essays | 882 | 7 | 4 |
| common-app-essay-examples | 547 | 8 | 2 |
| uc-piq-examples | 771 | 10 | 3 |
| how-to-start-a-college-essay | 705 | 6 | 3 |
| why-this-college-essay-examples | 710 | 8 | 3 |
| college-essay-format | 660 | 5 | 3 |
| common-app-essay-word-count | 579 | 4 | 3 |

**`scripts/sitemap.test.mjs`**, wired as `npm run test:sitemap`. Pure node.
Renders both metadata routes under production, fallback, local, preview and
misconfigured environments and asserts the registry matches the filesystem,
the sitemap is exactly the static pages plus every registered guide, every
lastmod is a declared date, every article canonical is built from the same
registry entry, robots has the rules above, nothing rendered for production
contains "localhost", and the production guard throws for localhost, www and a
preview host.

Not touched: `app/page.tsx`, anything under `prisma/`, any dependency. Nothing
in this branch reads from Prisma. The only network calls made during the work
were GETs against production pages.

## Verification completed

- `npx tsc --noEmit` clean.
- All 27 `test:*` scripts pass, including the new one.
- `npx next build` succeeds and lists `/robots.txt` and `/sitemap.xml` as
  static routes. Never `npm run build`, which applies migrations.
- `npx next start` on a spare port: both files render, the XML parses, eleven
  `<url>` entries, `lastmod` only where declared. Local output uses
  `http://localhost:3000` because `.env.local` sets it, which is expected; the
  test pins the production output.
- All eleven URLs fetched in production: 200, no `x-robots-tag`, no robots
  meta, and the eight guide pages carry canonicals equal to the sitemap paths.
  `/purchase/success` confirms as `noindex, nofollow`.
- `git diff --check` clean, zero em dashes added.

## What is left, and whose it is

1. **Fatimah: review and merge.** `git push` does not deploy; Vercel deploys
   `main`.
2. **After deploy, confirm the live sitemap before submitting it.**
   `GET https://admitfolio.com/api/version` returns the deployed sha, then
   `GET https://admitfolio.com/sitemap.xml` should list eleven apex URLs and no
   other host. If the build failed instead, the guard fired: check
   `NEXT_PUBLIC_SITE_URL` in the Vercel production environment.
3. **Fatimah: submit the sitemap in Search Console.** Separate step, her
   approval. Not part of the PR.
4. **Fatimah: redirect `www` to the apex** in Vercel domain settings. See below.

## Found but not fixed

- **`www.admitfolio.com` serves every page with a 200 and no redirect.** The
  guides canonicalize to the apex so they are safe. The homepage, privacy and
  terms carry no canonical at all, so www and apex are two indexable copies of
  each. The fix is a Vercel domain redirect, not code. Reported to Ritvik for
  Fatimah.
- **Every article declares `modified` equal to `published`**, while git shows
  six of the seven files were edited on Aug 21, the day after. Left as declared;
  bump `modified` in the registry when content actually changes.
- **The homepage has no canonical, no `metadataBase`, no Twitter card, and its
  FAQ has no structured data.** All known, all separate work.
- The `topicLinks` labels on the blog index ("UC PIQs", "School supplements")
  differ from the registry categories ("UC applications", "Supplements"). Left
  alone; unifying them is a copy decision.

## Environment

`DATABASE_URL` points at the production Supabase project. Reads are authorized
for this work; writes are not. Never run `npm run build` (it applies
migrations), `npm run db:push`, or `npm run db:studio`. There is no `.env` and no
`prisma/.env`, and the Prisma CLI does not read `.env.local`, so a bare
`prisma migrate` or `db push` cannot resolve `DATABASE_URL` or `DIRECT_URL` and
fails at schema validation. That protection rests on the absence of `.env`; do
not create one. `next dev` and `next start` do read `.env.local`, so both are
wired to production. This branch made no production write, migration or
backfill, and touched no database at any point.

Ritvik's working tree carries an uncommitted `.gitignore` change (adding
`.impeccable/` and `CLAUDE.local.md`). It is his, not part of this branch, and
was left unstaged.
