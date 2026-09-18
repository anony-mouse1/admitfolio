# Handover: a guide for engineering applicants

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/engineering-guide`, on `origin/main` at `042e8da` (#91 merged).
Committed locally, **not pushed**, no PR.

Branched off `main` deliberately. `ritvik/legitimacy-page` and the four branches
with open PRs (`ritvik/checkout-back-button`, `ritvik/cache-collection-pages`,
`ritvik/checkout-attribution`, `ritvik/remove-prelaunch-waitlist`) were all left
untouched. Nothing here depends on the legitimacy page.

## Why

`/essays/engineering` is the largest collection nothing linked to. 44 listings,
the biggest of the four major-based collections and second only to the Common
App personal statement collection, which already has two guides pointing at it.
The seven guides are the only pages on this domain that have indexed quickly, so
this is an eighth guide rather than more collection pages.

## What was added

`/guides/engineering-application-essays`, one article under `app/guides/`, built
from the same parts as the other seven: `GuideHeader`, `backLink`,
`articleHeader`, `articleStat`, `GuideArticleOverview`, `articleBody`,
`RelatedGuides`, `articleCta`, `GuideFooter`, and `app/guides/guides.module.css`
for the frame. It builds **Static**, so the whole article is in the served HTML.
No new component, no new CSS beyond one background colour.

- `lib/guides.ts` gains an entry, first in the list because the list is newest
  first. The registry is the only place the slug, category, dates, read time and
  card copy are written.
- `lib/collections.ts` gains the pairing in both directions: `GUIDE_COLLECTIONS`
  so the article's call to action resolves to `/essays/engineering` through
  `collectionPathForGuide`, and `guide` on the engineering collection so the
  collection page carries the "read the method first" line back.
- `app/sitemap.ts` was **not touched.** It reads the registry, so the article is
  in `/sitemap.xml` by construction, with `lastModified` from its own `modified`
  date. `/guides` moved to 2026-09-18 because it tracks its newest article.

### The read time, and the method behind it

**5 min read, from 1,221 counted words.** Not estimated.

`f453223` corrected all seven existing read times downwards, one by more than
three times, and recorded the method only in its commit message: the visible
text of the rendered page, table of contents included, at 225 words a minute,
rounded to the nearest minute. That sentence does not say which parts of the
page were counted, so the next person to add an article has to guess, which is
how the first seven came to be wrong.

`scripts/guide-read-time.mjs` is the answer, reverse engineered and then pinned.
The scope is the article's own text: headline, dek, stat block, table of
contents, summary and body. It excludes site chrome (nav, footer, back link,
category pill, byline) and the related-guides cards and call to action, which
are navigation rather than reading. **That scope reproduces all seven published
counts to within two words**, which is entity and apostrophe tokenising noise.
The script prints every article's count and exits non-zero if any `readTime` in
the registry disagrees with the page it labels, so this cannot drift again.

### The cover, the one thing decided without a mock-up

There is no eighth cover photo and none was invented. The card renders the
**CSS cover** instead, the branch `GuideCover` has always had and no guide has
ever taken: every entry already carried a `cover` and a `coverTitle` that
nothing rendered, because all seven had photos.

That needed three small changes, all reversible:

- `Guide.image` and `Guide.imageAlt` widened to `string | null`. `GuideCover`
  already typed its props that way.
- One new `cover` token, `engineering`, mapped in `app/guides/page.tsx` and
  given one line of CSS: `.coverEngineering { background: #d5dcd2; }`, the same
  muted family as the other six.
- `scripts/sitemap.test.mjs` no longer requires a non-empty `image`. It now
  asserts the stricter thing instead: image and alt text are **both set or both
  null**, a declared photo **exists in `public/`**, and every `cover` in the
  registry has both a class on the index and a rule in the stylesheet.

Screenshotted at 1440 and 390 and it reads as deliberate: sage background, the
existing diagonal stripe overlay, the white serif title card. **If a photo is
wanted, drop a `.webp` into `public/blog-images/` and put the two strings back
in the registry entry. Nothing else has to change.**

## The numbers, and where each comes from

Every figure in the article is an **aggregate off the public
`/api/listings`**, not the database, counted by
`scripts/engineering-guide-figures.mjs` on **September 18, 2026**. The article
states that date in the stat block, so a reader a year from now can tell how old
the counting is.

**No individual listing data is on the page.** No opening line, no teaser, no
seller, no background tag, no price. The figures script prints aggregates only
and writes nothing, and `scripts/verify-engineering-guide.mjs` asserts no dollar
figure appears in the copy at all.

| Stated | Value |
|---|---|
| The collection | 44 listings, 116 essays |
| Those essays | 28 personal statements, 26 UC PIQs, 62 supplements or short answers |
| No personal statement at all | 16, of which 7 are PIQ sets and 9 are supplements alone |
| Heaviest listing | 8 supplements and short answers |
| Most common shape | 17 of 44, a statement with supplements |
| Short answers | 23, in only 8 listings, 6 in one of them |
| UC PIQs | 8 listings, 6 of them complete sets of four |
| Disciplines | biomedical, then aerospace, then mechanical; 7 uncommitted |
| Colleges | 78 distinct, 45 appearing more than once |

Two assertions inside the figures script keep the article honest rather than
merely consistent: every essay must fall into exactly one of the three buckets
the stat block names, and every listing into exactly one of the three shapes.
Either one failing means the catalogue grew a prompt type the article does not
account for.

**One claim was corrected during writing.** The first draft said the 16 listings
with no personal statement "are supplements and short answers". Seven of them
are UC PIQ sets, where there is no personal statement to write. The article now
splits them.

### What the data could not support, and so is not on the page

- **No word-count advice.** `Essay.wordCount` is null on all 563 essays in the
  catalogue (see "Found but not fixed"), so there was nothing to calibrate
  against and the section was dropped rather than filled with generic advice.
- **No ranking claim.** 12 of the 44 listings claim a top-25 national university
  and 37 claim a top-50, which is real and checkable, but
  `/guides/why-this-college-essay-examples` tells applicants to leave rankings
  out of an essay, and a stat that contradicts a neighbouring article is worse
  than a missing one.
- **No claim about where short answers come from.** The load is concentrated in
  eight listings, but nothing in the public API says which programs asked, so
  the article says the total varies by school list and to go and count it.
- **No claim about what admissions readers think.** Every piece of advice is
  framed as craft.

## Links, in and out

`uc-piq-examples` was an orphan in the article graph: it linked out to three
siblings and no article linked back. **This article links to it in the body**,
on a real reason (8 of the 44 engineering listings carry PIQ sets), and again
from the related-guides cards, so the orphan is closed.

| Surface | Links |
|---|---|
| The article's call to action | `/essays/engineering`, one link, no fragment |
| The article's body | `why-this-college-essay-examples`, `uc-piq-examples`, `how-to-take-inspiration-from-college-essays`, and Common App's first-year guide |
| Related guides | the same three articles |
| `/essays/engineering` | back to the guide, in its served HTML |
| `/guides` | the card, listed first |

The article does **not** end at `/#browse`. That fragment is computed on the
client and is not in the served homepage document, which is why the three
already-paired guides were moved off it in #90.

## Verification completed

- `npx tsc --noEmit` clean. All **29** `scripts/*.test.mjs` pass.
- `npx next build` succeeds. `/guides/engineering-application-essays` is
  `○ (Static)`, the route table is otherwise unchanged, no new warnings.
  **Never `npm run build`**; it applies migrations to production.
- **`/sitemap.xml` fetched, not read off the route file.** The guide is at
  `lastmod 2026-09-18`, and `/guides` moved to the same date.
- `scripts/guide-read-time.mjs`: the registry agrees with every rendered page,
  and the method still reproduces all seven counts from `f453223`.
- **`scripts/verify-engineering-guide.mjs`**, new, NOT in `package.json`: it
  needs a server and a browser, and `test:*` is pure. **25 checks** against
  `npx next start`. Served with no JavaScript: the headline, all 7 sections, all
  16 figures, the date, no em or en dash, no price, one call to action link
  pointing at the collection with no fragment anywhere in the block, the back
  link, the canonical, the OpenGraph article tags, the JSON-LD, the sitemap, the
  index card, and the collection linking back. Hydrated at **1440 and 390**: the
  back link, the layout, the call to action, the body links, the index card and
  the click through to the collection.
- **The back link was hit-tested, not assumed.** `elementFromPoint` at the
  link's own centre returns the link at both widths. It clears the nav by 31px
  at 1440 and 22px at 390. This is the failure the CSS comment at
  `guides.module.css:641-644` records: the logo used to sit on top of it on all
  seven articles.
- `scripts/verify-guide-collection-links.mjs`, extended with the new pairing:
  36 checks over two widths, all four paired guides land on a collection with
  cards. 44 cards on `/essays/engineering`, matching the figure in the article.
- Mutation checked, four ways: dropping the cover class mapping, a photo with
  null alt text, a photo that is not on disk, and forgetting the new pairing in
  the test's own map each fail with the message they should.
- Screenshots at 1440 and 390 of both the article and the index card.
- **No database write of any kind**, and no database read either. Everything
  came from the public JSON API. No production data was copied into the repo.

## What is left, and whose it is

1. **Ritvik: review, then push and open a PR.** Nothing is pushed.
2. **The cover photo, if one is wanted.** See above; it is two strings and a
   file, and nothing else changes.
3. No env var, no migration, no backfill.

## Found but not fixed

- **`Essay.wordCount` is null on all 563 essays in the catalogue, and always
  will be.** The seller wizard builds each essay row with `prompt`, `question`,
  `price` and `contentHash` and no word count (`app/page.tsx:1302-1307`), while
  the API reads `e?.wordCount` and therefore stores null every time
  (`app/api/submit-listing/route.ts:199,209`). Five surfaces render it
  conditionally and so render it never: the buyer's detail sheet
  (`components/ListingDetail.tsx:192`), the admin panel
  (`app/admin/page.tsx:1042`, which only ever shows it for its own preview mock
  data), the seller dashboard (`SellerApplicationsWorkspace.tsx:264`), the
  dashboard total (`lib/sellerDashboardView.ts:219`) and the AI reviewer's
  prompt (`lib/review.ts:244`, whose "claimed word count" line never appears).
  "How long is it" is a basic question a buyer asks about a $20 to $145 essay,
  and the field to answer it is plumbed end to end and populated nowhere.
- **The category pill is hidden on every article below 560px.**
  `app/globals.css:784` sets `.pill { display: none }` inside the media query
  commented "Hero fits one phone view: pill + stats hidden", which was written
  for the homepage. It catches the article category on all eight guides, so a
  phone reader never sees "Engineering", "Common App" or "UC applications".
  Pre-existing, not caused here, one line to fix if wanted.
- **"Louisiana Stare University" renders verbatim on the live
  `/essays/engineering` page**, in a card's "Accepted at" line. It is a seller
  typo for "State" that `lib/schools.ts` cannot resolve, so `schoolShortName`
  title-cases it and passes it through. Six other engineering admit tags do not
  resolve either: `University of Arizona` (the table has `asu.edu` but no
  `arizona.edu`), `Clarkson University`, `Fordham` lowercase, `SUNY Buffalo
  State`, `San Francisco Bay University` and a bare `University of California`.
  None mis-resolves to the wrong school, so this is missing logos and long
  names rather than a pricing risk, but the misspelling is visible copy.
- **Five listings are in both `/essays/engineering` and
  `/essays/computer-science`**, because "computer engineering" matches both
  rules. Correct as designed, worth knowing before anyone reads the two
  collection counts as a partition.
- **The engineering collection's own copy is still accurate** against today's
  catalogue: "most include a Common App personal statement" is 28 of 44, and
  every discipline it names is present. No change needed.
- Confirms a known bug rather than finding one: only 14 of the 116 engineering
  essays carry the college's own question text, and every one of them sits under
  "Other supplement", which is the `/^other/i` gate already in the bug list.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not, and this branch did neither. There is no `.env` and
no `prisma/.env`; do not create one. Stripe is sandbox (`sk_test_`). Ritvik's
uncommitted `.gitignore` change is his and was left unstaged.
