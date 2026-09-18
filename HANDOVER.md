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

`/essays/engineering` is the largest collection nothing linked to: the biggest
of the four grouped by major, and second overall only to the Common App personal
statement collection, which already has two guides pointing at it. The seven
guides are the only pages on this domain that have indexed quickly, so this is
an eighth guide rather than more collection pages.

(That comparison is why the article exists. It is not in the article, and no
count is. See below.)

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

**6 min read, from 1,286 counted words.** Not estimated. See "Read time" below
for why it went up rather than down.

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

### The cover, blocked on Ritvik

**There is no image in this repo that fits, so the card still renders the CSS
cover and `Guide.image` is still nullable.** Ritvik is picking one. Downloading
anything is out: third-party licensing needs written approval under his
contract.

What the repo actually holds:

- `public/blog-images/` is seven photos and all seven are claimed, one per
  existing guide.
- `public/assets/schools/` and `public/mockup-assets/university-logos/` are
  university logos and seals. `public/assets/schools/SOURCES.md` says outright
  that the marks "remain the property of their respective owners" and that "the
  repository does not record their original upstream URLs", so one of those on a
  blog cover would be unattributed third-party marks implying endorsement.
- `app/icon.svg` and `app/apple-icon.png` are the favicon.

**When an eighth photo lands**, three things go back the way they were and
nothing else changes: drop the file into `public/blog-images/`, put the two
strings into the registry entry, narrow `Guide.image` and `Guide.imageAlt` back
to `string`, and restore the non-empty assertion in `scripts/sitemap.test.mjs`.
The stricter assertions added alongside it are worth keeping either way: a
declared photo has to exist on disk, and every `cover` token has to have a class
on the index and a rule in the stylesheet.

Until then the card is a sage panel with the existing diagonal overlay and the
white serif title card, which looks deliberate on its own and plainer than its
seven neighbours in a row.

## No catalogue statistics, and why

The first draft opened with counts off `/api/listings`: how many engineering
listings, how many essays, how the prompts split, how many colleges appeared.
**All of it is gone.** Those numbers go stale the day someone lists another
engineering essay, Google caches the old ones, and the reader is a junior
writing a supplement who has never heard of this site and does not want our
inventory.

**The claims survived; the arithmetic did not.** Each one is now stated as a
fact about engineering applications:

| Was | Is now |
|---|---|
| 116 essays split 28 / 26 / 62 | one Common App essay goes everywhere, each college adds its own |
| 16 of 44 with no personal statement | how much you write depends entirely on where you apply |
| 23 short answers in 8 listings | a few programs, mostly large publics on their own portals, attach a run of them |
| biomedical 14, aerospace 10, mechanical 8 | engineering covers a dozen fields; those three meet the same prompt with different material |
| 78 colleges, 45 repeating | prompts differ enough between programs that a good example can teach the wrong shape |
| 8 listings with PIQ sets | UC ignores the Common App and asks for four PIQs of up to 350 words |

The paragraph explaining that our listings are whole applications is also gone.
It existed only to set the counts up.

`scripts/engineering-guide-figures.mjs` is **deleted**. It guarded nothing once
the figures came out, and this repo already has one verifier rotting in it.
`scripts/verify-engineering-guide.mjs` now asserts the opposite of what it used
to: nine claims have to survive in the served text, and ten patterns shaped like
a catalogue count have to be absent. Mutation checked by putting
"Sixteen of the 44 engineering listings" back, which fails on
`/\bof the \d+ (engineering )?listings\b/`.

### The Common App claim, verified

The article tells applicants that a college's writing requirements appear in
**My Colleges**. Checked against
`https://www.commonapp.org/apply/first-year-students/` before it stayed in. That
page says "You can find more information about writing supplements in **My
Colleges**", "In My Colleges or College search, you can learn more by viewing a
school's college information page", and "Every college gets to choose their own
recommendation requirements." The link is in the article on the words "guide for
first-year applicants".

### The prose

Ritvik flagged twelve sentences built on the same antithesis, the
X-is-not-the-thing-Y-is-the-thing shape, plus the dek. **Twenty-five sentences
were rewritten into different shapes**, not reworded into the same one. Two
instances survive on purpose, which is where he wanted it: the spec-sheet
paragraph, and the 650-word contrast in the short-answers section.

Worth knowing: **that pattern is the existing house voice.** Five of the seven
deks are built on it, and so is the "Why we wrote this" stat block on the Common
App guide. This article now reads slightly differently from its neighbours as a
result. That was the instruction and it is the better call for a reader, but it
is a divergence rather than a match.

Three "our guide to X covers it" links were all phrased the same way. **One was
cut**, the general "read examples properly" pointer to
`how-to-take-inspiration-from-college-essays`, because the related-guides block
and the call to action were both already making it. The other two are rephrased
and both do work the sentence around them needs: "a method of its own" separates
why-engineering from why-this-college, and "Choosing which four to answer" hands
off the UC application, which is a separate application rather than a
supplement. `how-to-take-inspiration` keeps its related-guides card, so
`uc-piq-examples` is still un-orphaned and nothing lost a link entirely.

### Read time

**6 min read, from 1,286 counted words.** It went up, not down: cutting the
statistics removed about forty words, and the rewrites added seventy, because
antithesis is a compressive shape and the sentences that replaced it are not.

**This is now the longest article on the blog by some way**, against 545 to 881
for the other seven. Nothing in it is padding, but if it should be shorter the
section to lose is "Reading examples without inheriting the wrong shape", which
is the one whose advice the other guides already carry.

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
  `npx next start`. Served with no JavaScript: the headline, all 7 sections, the
  **9 claims that had to survive losing their counts**, the **10 catalogue-count
  patterns that must stay absent**, no em or en dash, no price, one call to
  action link pointing at the collection with no fragment anywhere in the block,
  the back link, the canonical, the OpenGraph article tags, the JSON-LD, the
  sitemap, the index card, and the collection linking back. Hydrated at **1440
  and 390**: the back link, the layout, the call to action, the two body links,
  the index card and the click through to the collection.
- **The back link was hit-tested, not assumed.** `elementFromPoint` at the
  link's own centre returns the link at both widths. It clears the nav by 31px
  at 1440 and 22px at 390. This is the failure the CSS comment at
  `guides.module.css:641-644` records: the logo used to sit on top of it on all
  seven articles.
- `scripts/verify-guide-collection-links.mjs`, extended with the new pairing:
  36 checks over two widths, all four paired guides land on a collection with
  cards. 44 cards on `/essays/engineering`, matching the figure in the article.
- Mutation checked, five ways: dropping the cover class mapping, a photo with
  null alt text, a photo that is not on disk, forgetting the new pairing in the
  test's own map, and putting a catalogue count back into the copy each fail
  with the message they should.
- Screenshots at 1440 and 390 of both the article and the index card.
- **No database write of any kind**, and no database read either. The figures
  that informed the first draft came from the public JSON API and are now out of
  the article entirely. No production data was copied into the repo.

## What is left, and whose it is

1. **Ritvik: the cover photo.** Blocked on him, not on work. Nothing in the repo
   fits and downloading one needs written approval under his contract. The card
   renders the CSS cover until he picks one, and `Guide.image` stays nullable
   until it lands.
2. **Ritvik: review, then push and open a PR.** Nothing is pushed.
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
