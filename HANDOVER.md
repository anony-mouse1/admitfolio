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

**6 min read, from 1,284 counted words.** Not estimated. See "Read time" below
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

### The cover photo

Ritvik supplied one: a university library reading room, Unsplash, Dominic
Kurniawan Suryaputra, `r0U2y0HhdGE`, Unsplash License, downloaded 2026-09-18.

**4.79 MB in, 119.1 KB out**, a 97.6% cut. 4240x2832 progressive JPEG to
1200x800 WebP at quality 72, converted with the `sharp` already in
`node_modules` as a Next dependency. Nothing installed, no dependency added.
Quality 72 and 80 were compared at the real display crop (1082x540, the card at
2x) and are indistinguishable, so the smaller one shipped.

**"Match the existing seven" turned out not to be well defined.** They agree on
format and on nothing else: all WebP, sRGB, no ICC, no EXIF, but 600x400 through
1400x934, ratios 1.50 to 1.67, and 17.4 KB through 314.3 KB. The measurements
are in `public/blog-images/SOURCES.md`.

So: WebP to match the one thing they share, and **1200x800 because that is what
`app/guides/page.tsx` already declares on the `<img>`**. This is the only file in
the directory for which that declaration is true, and it is the only one not
upscaled on a 2x display, where the card is 507 CSS px wide at 1440 and 360 at
390. At 119 KB it is well under the 314 KB the directory already carries.

The 4.79 MB source was moved out of the repo rather than committed: none of the
other seven has an original here, and the Unsplash URL in `SOURCES.md` makes it
re-fetchable.

Wired up, and the nullable type is gone:

- `image` and `imageAlt` are set, and `Guide.image` / `Guide.imageAlt` are back
  to required `string`.
- The **"image is non-empty" assertion is restored** in
  `scripts/sitemap.test.mjs`. The "both or neither" assertion added while the
  type was nullable is **dropped as subsumed**: with both required and non-empty
  it can no longer fail. The two stricter ones stay, and both were re-checked by
  mutation: a declared photo must exist on disk, and every `cover` token must
  have a class on the index and a rule in the stylesheet.
- `public/blog-images/SOURCES.md` is **new**, modelled on
  `public/assets/schools/SOURCES.md`, recording source, photographer, URL,
  licence, download date, and the before and after of the conversion.

**`GuideCover` now takes its photo branch, which does not render `coverTitle`**,
so the verifier's card assertions were rewritten: the photo is served as
`image/webp`, decodes at 1200x800, is `object-fit: cover`, leaves no gap, sits
in a cover box the same height as the other seven, and the index shows 8 cards.
The `<img>` is laid out at its own ratio and overflows the fixed-height box,
which `.blogCover` clips; all eight behave that way, and the first version of
that assertion was wrong rather than the layout.

### While placing it: a stock watermark on a live photo

**`public/blog-images/inspiration.webp` has a `dreamstime` preview watermark
baked into the pixels**, a script wordmark across the horizontal centre. It is
faint against a bright background and easy to miss, and it is serving in
production right now on the `/guides` card for
`how-to-take-inspiration-from-college-essays`.

A watermark like that is on a comp rather than a licensed download. The centre
band of all eight files was checked at raised contrast and this is the only one.
It predates this branch and it is **not touched here**: it is a licensing
question, which under Ritvik's contract goes to Fatimah. Recorded in
`public/blog-images/SOURCES.md` so it cannot be lost.

Related: that commit, `57d5c5c`, records no source, photographer, licence or URL
for any of the seven, and nothing else in the repo does either.

### The stat block, left alone

Ritvik asked whether the other seven all put a real fact in theirs, and to
delete this one if any of them omit the block.

**All eight have one, so nothing was deleted. But the "real fact" premise only
holds for two of seven.** What they actually hold:

| Guide | Stat block | Kind |
|---|---|---|
| `common-app-essay-word-count` | the personal essay accepts 250 to 650 words, and 650 is a limit not a target | **external fact** |
| `uc-piq-examples` | UC gives eight PIQs, you choose four, up to 350 words each | **external fact** |
| `college-essay-format` | use normal paragraphs, separate dialogue, skip decorative formatting, inspect the preview | advice |
| `how-to-start-a-college-essay` | draft the clearest scene in the middle first, write the opening after | advice |
| `how-to-take-inspiration` | notice one writing choice, close the example, turn it into a question | a method |
| `why-this-college-essay-examples` | if you can swap the college name and it still works, the research is not specific enough | a test |
| `common-app-essay-examples` | Admitfolio has hundreds of real application essays from verified students | a claim about us |

So five of seven put advice, a method, a test or an editorial line in the box.
Neither of Ritvik's branches fired cleanly, so the block stays as written and
the decision is his. His read of it is right either way: it does restate the
first paragraph of section 1.

**No verifier asserts the block exists on every guide any more.**
`scripts/guide-read-time.mjs` used to, through `need('articleStat')`, and would
have failed outright on a guide that dropped it. It now counts zero for a
missing block. Mutation checked: with the block removed the count fell from
1,284 to 1,246 and the script still passed.
`scripts/verify-engineering-guide.mjs` only ever included it in a selector list
for the clipping sweep, which tolerates its absence, and its claim assertions
are article-specific rather than about every guide.

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

**6 min read, from 1,284 counted words.** It went up, not down: cutting the
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
  needs a server and a browser, and `test:*` is pure. **26 checks** against
  `npx next start`. Served with no JavaScript: the headline, all 7 sections, the
  **9 claims that had to survive losing their counts**, the **10 catalogue-count
  patterns that must stay absent**, no em or en dash, no price, one call to
  action link pointing at the collection with no fragment anywhere in the block,
  the back link, the canonical, the OpenGraph article tags, the JSON-LD, the
  sitemap, the cover photo (served as `image/webp`, under the largest file
  already in the directory, with alt text), and the collection linking back.
  Hydrated at **1440 and 390**: the back link, the layout, the call to action,
  the two body links, the card's photo (decoded at 1200x800, `object-fit:
  cover`, no gap, clipped by its box, same cover height as the other seven, 8
  cards on the index) and the click through to the collection.
- **The back link was hit-tested, not assumed.** `elementFromPoint` at the
  link's own centre returns the link at both widths. It clears the nav by 31px
  at 1440 and 22px at 390. This is the failure the CSS comment at
  `guides.module.css:641-644` records: the logo used to sit on top of it on all
  seven articles.
- `scripts/verify-guide-collection-links.mjs`, extended with the new pairing:
  36 checks over two widths, all four paired guides land on a collection with
  cards. 44 cards on `/essays/engineering`, matching the figure in the article.
- Mutation checked, six ways: dropping the cover class mapping, empty alt text,
  a photo path that is not on disk, forgetting the new pairing in the test's own
  map, and putting a catalogue count back into the copy each fail with the
  message they should. Removing the stat block, the sixth, now **passes**, which
  is the point of that change: the count fell to 1,246 rather than throwing.
- Screenshots at 1440 and 390 of the article, and of the new card sitting in
  the grid beside its neighbours, which is what the photo had to survive.
- **No database write of any kind**, and no database read either. The figures
  that informed the first draft came from the public JSON API and are now out of
  the article entirely. No production data was copied into the repo.

## What is left, and whose it is

1. **Fatimah, through Ritvik: the watermark on `inspiration.webp`.** Live in
   production, licensing question, not this branch's to fix.
2. **Ritvik: the stat block.** Left as written; his call whether to replace it.
3. **Ritvik: review, then push and open a PR.** Nothing is pushed.
4. No env var, no migration, no backfill.

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
