# Handover: linking the guides into the essay collections

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/link-guides-to-collections`, on `origin/main` at `4a9026d`
(#87 merged). Pushed and open as PR #90 against `main`.

Branched off `main` deliberately, not off either checkout branch. #88 has since
merged and #89 remains open; this touches none of the same files.

## Why

`/essays/biology` shipped on 8 Sep and five days later Search Console still says
"Discovered, currently not indexed", last crawl N/A, discovered via sitemap,
referring page none detected. The seven guides indexed within a day back on
7 Sep because `/guides` links to each of them. This is recommendation 6 of the
buyer acquisition audit, brought forward.

## What the crawl audit actually found, before any change

The starting premise was that the collection pages had the sitemap and nothing
else. That is wrong, and worth writing down so nobody re-derives it.

Every number below is from `curl` against production on 13 Sep, raw served HTML,
JavaScript never executed.

| Page | Collection anchors in served HTML |
|---|---|
| `/` | 6, the whole band, plus the `/essays` pill and a footer `/essays` |
| `/essays` | 6 |
| `/guides` | 0 |
| each of the 7 guides | 0 |

- **The homepage band was never client-only.** `LAUNCHED` is constant folded at
  build time and `pageView` initialises to `'home'`, so the band renders on the
  server. Only the "N listings" badge waits on the client catalogue fetch
  (`{n > 0 && ...}` at `app/page.tsx:2344`); the anchor around it is
  unconditional. Nothing to fix there, so nothing was changed there.
- Googlebot's user agent gets byte identical HTML, 70272 bytes either way. No
  `rel="nofollow"` anywhere. `robots.txt` blocks only `/admin` and `/api`. All
  six collections are in `sitemap.xml`.
- So the missing referring pages are the guides, and only the guides.

## What changed

**Three guides now end at the collection they are about**, instead of at
`/#browse`.

| Guide | Now links to |
|---|---|
| `uc-piq-examples` | `/essays/uc-personal-insight-questions` |
| `common-app-essay-examples` | `/essays/common-app-personal-statement` |
| `common-app-essay-word-count` | `/essays/common-app-personal-statement` |

One link each, in the closing call to action that was already there. Not a block
of links at the foot of every article.

**Four guides were left alone**, on purpose, and the absence is asserted in the
test so nobody adds them later by reflex:

- `how-to-take-inspiration-from-college-essays`, `how-to-start-a-college-essay`
  and `college-essay-format` are about every essay on the site rather than one
  group of them.
- `why-this-college-essay-examples` is about school supplements, and there is no
  supplements collection to point at. It is the one real candidate for a seventh
  collection.

**The pairing lives in `lib/collections.ts`**, as `GUIDE_COLLECTIONS` plus
`collectionPathForGuide`. It is not the existing `Collection.guide` field read
backwards: that field is one guide per collection, for the "read the method
first" line on a collection page, and this direction is many to one, because
both Common App guides belong to the one Common App collection. Passing an
unpaired guide slug, or naming a collection that no longer exists, is a compile
error rather than a 404 discovered later.

**Copy.** Each of the three call to action paragraphs now describes the
collection rather than the whole catalogue, because the button no longer goes to
the whole catalogue. The two Common App buttons read "Browse personal
statements", not "Browse Common App personal statements": the longer label wraps
onto two lines at 390 and fills 88 percent of the card. Measured, not guessed.
299px on one line against the 300px the live label occupies today.

## Verification completed

- `npx tsc --noEmit` clean. All 27 `test:*` pass, plus `pricing` and `name-leak`
  by hand. `npx next build` succeeds. Never `npm run build`; it applies
  migrations.
- **`scripts/verify-guide-collection-links.mjs`**, new, not in `package.json`
  and not eligible for `test:*`: it needs a server and a browser, and `test:*`
  is pure. 31 checks over 390 and 1440.
  - The first half reads the **served document** over plain `fetch`, with no
    browser involved, which is the half that matters here. Every assertion after
    it reads the hydrated DOM, where a server-rendered link and a client-only
    one are indistinguishable.
  - The second half drives headless Chrome: the block is not clipped, the link
    sits inside its own card, the page does not scroll sideways, the block holds
    exactly one link, no em dashes, no console errors, and following the link
    lands on a collection that renders cards.
  - It never opens checkout and writes nothing.
- Every new assertion was confirmed to fail when the thing it guards is broken.
  Seven mutations against `scripts/sitemap.test.mjs`, six against the browser
  script, thirteen caught. The two that matter most: turning a band card into a
  `div` with an `onClick`, and gating the band on the client catalogue fetch.
  Both compile, both work for a human, both are invisible to a crawler, and both
  now fail the served-document check.
- Screenshots at 390 and 1440, production as the before and this branch as the
  after, in the PR description when it is opened.
- No database write, no migration, no backfill. The only reads were the app's
  own public catalogue queries.

## What is left, and whose it is

1. **Fatimah: review and merge PR #90.**
2. No hand-run step. No migration, no backfill.

## Found but not fixed

- **The collection pages are the only public pages that are not cached.**
  `export const dynamic = 'force-dynamic'` on `app/essays/page.tsx:13` and
  `app/essays/[collection]/page.tsx:23` means Vercel serves them with
  `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` and
  `x-vercel-cache: MISS` on every single request. `/` and `/guides/*` serve
  `x-nextjs-prerender: 1` on a CDN HIT. Measured against production: TTFB 0.29
  to 0.34s for a collection, 0.07 to 0.16s for a guide or the homepage.
  `no-store` is not `noindex` and Google does not treat it as one, but this is
  the one technical difference between the pages that indexed in a day and the
  pages that have not been crawled at all in five days. Whether a collection
  genuinely needs to be uncached is a real question: the catalogue changes when
  a listing is approved, which is not often, and `revalidate` with a tag would
  serve a crawler a cached page without serving a stale one for long.
- **The four unpaired guides still end at `/#browse`, which does not exist in
  any served document on the site.** The homepage computes that section's id:
  `id={LAUNCHED && pageView === 'home' ? 'featured' : 'browse'}`
  (`app/page.tsx:2360`), and `pageView` initialises to `'home'`, so the raw HTML
  contains `id="featured"` and no `#browse` anywhere. It works for a reader,
  because the mount effect reads the hash and flips the view
  (`app/page.tsx:540`). It passes nothing to anything for a crawler. Four guides
  plus the shared nav and both footers point at it. The cheap fix is `/essays`,
  which is a real page about exactly what those articles are about; it was left
  out of this branch because the brief said not to force a match.
- **Four of the six collections have no guide at all.** Engineering, business,
  biology and computer science are reachable only from `/` and `/essays`. There
  is no article to link them from, so no amount of internal linking work fixes
  them. That is a content gap, and `/essays/biology` being the page Search
  Console was asked about is not a coincidence.
- **`uc-piq-examples` is still an orphan inside the article graph.** It links
  out to three siblings and no article links back to it. It now has one inbound
  link from `/essays/uc-personal-insight-questions`, which is new, but nothing
  from `/guides/*`.
- **The sitemap gives collections no `lastmod`.** Deliberate, asserted in
  `scripts/sitemap.test.mjs` as "no invented date", and correct as far as it
  goes: a collection moves when a listing is approved and nothing records that.
  Worth revisiting only if the crawl delay persists after these links land.
- **`www.admitfolio.com` 308s to the apex**, checked on
  `/essays/biology`. An older note treated the www duplicate as open. For this
  path it is not.
- **Search Console access is still missing**, so none of this can be confirmed
  from the crawl side. Whether Google has recrawled `/` or `/essays` since 8 Sep
  is exactly the question that would settle why "referring page: none detected"
  was reported, and it cannot be answered from here.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Next 16.3's dev server appends a generated block to `AGENTS.md` on
every `npx next dev` start; it did not this time, but check `git status` before
committing. Ritvik's uncommitted `.gitignore` change is his and was left
unstaged.
