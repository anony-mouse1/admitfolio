# Handover: a page that answers "is admitfolio legit"

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/legitimacy-page`, on `origin/main` at `042e8da` (#91 merged).
Committed locally, **not pushed**, no PR yet, because Ritvik is waiting on
answers from Fatimah.

Branched off `main` deliberately. `ritvik/checkout-back-button`,
`ritvik/cache-collection-pages`, `ritvik/checkout-attribution` and
`ritvik/remove-prelaunch-waitlist` were all left untouched; all four have open
PRs.

## Why

"Is admitfolio legit" is the site's third biggest search query at roughly 33
clicks a month, and nothing on the site answered it. Google was assembling its
own answer out of the checkout screen and the Terms of Service, because those
were the only pages that mentioned verification or refunds at all.

## What was added

`/legit`, one server-rendered page at `app/legit/page.tsx`. Same shape as an
article under `app/guides/`: canonical plus an OpenGraph card in `metadata`, the
shared `GuideHeader` and `GuideFooter`, and `app/guides/guides.module.css` for
the article frame. It builds **Static**, so the whole answer is in the served
HTML with no JavaScript involved. That is the point: `app/page.tsx` is one large
client component and a crawler sees `Loading essays...` there, which is why this
could not be a section on `/`.

- `lib/legit.ts` holds `LEGIT_PATH` and `legitUrl()`, the same arrangement as
  `lib/guides.ts` and `lib/collections.ts`, so the path is written once.
- `app/legit/legit.module.css` covers only what a guide has no equivalent of:
  the four verification step cards and the FAQ.
- `app/sitemap.ts` lists `/legit`, with no `lastModified`: nothing records when
  its claims last changed, and a build timestamp would be a lie.
- **Organization JSON-LD**, which the site had nowhere. No `logo` property:
  there is no logo file in `public/`, and a logo URL that 404s is worse than
  none.
- **No FAQPage markup, deliberately.** Google restricted FAQ rich results to
  government and health sites, so it would render nothing and only add a surface
  to get wrong. The questions are still real `<h3>` headings in the HTML.

## Where it is linked, and where it is not

| Surface | Links | Why |
|---|---|---|
| Footer, under Product | Both footers | `GuideShell.tsx` and the copy in `app/page.tsx` |
| Each of the six collection pages | Once, in the body | Search landing pages; a first-time visitor arrives there |
| Checkout proof panel | Once, new tab | Someone stalling at payment is exactly who wants it |
| The seven guides | Footer only | Ritvik's call: an identical block on every article reads as persuasion |
| The nav | **Not added** | See below |

**The nav was measured, not guessed.** With a fifth item the links row wraps to
two lines from 1100px down instead of from 960px, and at 901px the "Find my
matches" button lands 51px outside the nav pill. Four items leave 77px of slack
at 1440, five leave 24px. That is crowding, so the nav was left alone. The
numbers and the reasoning are recorded in `scripts/verify-legit-page.mjs`, which
asserts the nav still has four items so a silent re-add fails.

`/legit` links per served document: `/` 3, `/essays` 1, each collection page 4,
each guide 1. The counts above 1 are the checkout overlay's proof panel, which
is mounted twice (desktop and phone). That is how the component has always
worked, and every string in it appears twice for the same reason. Not changed:
it is one URL either way, and the payment screen is the last place to add
structure for a link count.

## The claims, and what backs each one

Verified read-only against the production database on Sep 16 2026:

- **No listing goes live on an automated decision alone.**
  `SELECT count(*) FROM "Listing" WHERE status='approved'` is 192; 191 have
  `humanReviewedAt` set, and the one without has `aiDecision` not equal to
  `'approved'`, so `isAdminApprovedListing` reads it as legacy admin approval.
  **Zero listings were approved on an automated decision**, which is what makes
  that sentence safe to state flatly.

  **The page carries no count, deliberately.** It said "191 of the 192 listings
  on sale today carry a recorded human review" until Ritvik cut it: a documented
  number can only go stale, and on a page whose whole job is being believable
  the version without it is the stronger claim anyway, because it is true of all
  192 rather than of 191. Do not put a figure back into that step.

Reused from the checkout proof panel in `components/ListingCheckout.tsx`, whose
wording was already checked against the database once. A buyer who reads this
page and then reaches the payment screen now meets the same sentences.

Read out of the code: the `.edu` rule (`emailAllowed`, `lib/config.ts:80`), the
one-year token (`ACCESS_TTL_MS`, `lib/accessToken.ts:9`), the per-buyer
watermark (`lib/watermark.ts`, applied at `app/api/essay/[essayId]/route.ts:81`,
which 502s rather than serve an unstamped PDF), and Stripe holding the card
details (`ui_mode: 'embedded_page'`, `lib/commerce.ts:208`).

### What the page deliberately does not claim

No named detection system, anywhere: no Common App, no Turnitin, no claim that
these essays sit in any checker's corpus, no promise that copying will be
caught. None of that is true today and the page's whole job is being believable.
`scripts/verify-legit-page.mjs` asserts all of it is **absent**, so it cannot
drift back in.

The deterrence section states two facts instead. One about the file: every copy
carries a code tied to the purchase. One about the world: colleges do compare
submitted essays and do rescind offers over plagiarism, sometimes years later.
Consequences for sharing are stated as consequences and not enumerated, because
no policy has been defined and inventing one would be worse than the gap.

### The acceptance letter, worth reading before editing this page

Acceptance letters are stated in the **present tense with no count**, on
purpose. Only sellers behind 76 of the 192 live listings have an `AdmitProof`
row: the upload flow shipped around Aug 3 2026 (first row Aug 3), and the 116
live listings whose sellers have no row were all created on or before Aug 1.

Fatimah confirmed to Ritvik that she checked those earlier listings by email
before the upload flow existed, so they are not unverified; the record simply
lives in an inbox rather than in the database. The page therefore says what
happens to a submission today and **claims nothing about the older listings**,
with no caveat and no footnote. Do not add a count to that step.

## Open with Fatimah, both marked in `app/legit/page.tsx`

1. **Partnerships. Needs her approval before this merges.** One sentence now
   sits at the end of "What happens if someone copies one", added on Ritvik's
   instruction and in his wording:

   > We are working on integrations with plagiarism detection services, which
   > would mean essays bought here can be checked against submitted work.

   It names no company, gives no date, and is conditional, so it describes work
   in progress rather than something that exists today. **Partnership work is
   out of scope under Ritvik's contract without Fatimah's written approval, and
   she has not given it.** The sentence is in the PR for her to approve, cut or
   reword, and it is called out in the PR description rather than left to be
   found in the diff. It is also the one claim on the page that is not backed by
   the database or the code: it rests on Ritvik's assertion.

   `scripts/verify-legit-page.mjs` pins the whole sentence and keeps "Common
   App" and "Turnitin" on the forbidden list, so it can neither drift nor grow
   into a named service.
2. **Who support routes to. Settled for now: "the team".** The copy says "a
   person on the team" and names nobody, which Ritvik confirmed is what he
   wants. Still open if she wants it: a named owner or a stated response time.
   A response time is a commitment to a buyer, so it is hers to make.

## Verification completed

- `npx tsc --noEmit` clean. All **29** `scripts/*.test.mjs` pass.
- `npx next build` succeeds, `/legit` is `○ (Static)`, route table otherwise
  unchanged. **Never `npm run build`**; it applies migrations to production.
- `scripts/sitemap.test.mjs` extended: `/legit` added to `STATIC_PATHS`,
  `lib/legit.ts` relinked, and two new assertions that the page file exists and
  that `LEGIT_PATH` is `/legit`. Mutation checked: moving `app/legit/page.tsx`
  away fails it on "so the page has to exist".
- **`scripts/verify-legit-page.mjs`**, new, NOT in `package.json`: it needs a
  server and a browser, and `test:*` is pure. Against `npx next start` it checks
  all 24 claims are in the **raw served HTML**, all 7 forbidden strings are
  absent, the page is prerendered, it is in the sitemap, the eleven link counts
  hold, no guide has an in-body link, and at **390 and 1440** the heading, four
  steps and four questions render with no overflow, no clipped text and no
  console errors.
- Screenshots at both widths, plus a collection page with and without a paired
  guide, to confirm the guide note and the trust note do not compete.
- **No database write of any kind.** The reads were counts against `Listing` and
  `AdmitProof` to check the human-review and acceptance-letter coverage, run
  through a throwaway script that was deleted. No production data
  was copied into the repo.

## What is left, and whose it is

1. **Fatimah: the two placeholders above.** Neither blocks the page shipping as
   written; both would add to it.
2. **Ritvik: review, then push and open a PR.** Nothing is pushed.
3. No env var, no migration, no backfill.

## Found but not fixed

- **The nav wraps to two lines at 960px and below, before this branch.** Four
  items, `.nav-links` only hides at 900px, so there is a 60px band where the
  links row is already two lines. Not caused here and not touched.
- **`/essays`, the collections hub, has only the footer link.** Ritvik asked for
  one in-body link on each collection page; the hub is a landing page too, and
  whether it should get one is a question rather than an oversight.
- **`scripts/verify-browse-ui.mjs` is still stale**, as recorded on the
  pre-launch branch: it stops on `Unexpected nav: High schooler?|In college?`
  and its `home.featured === 6` assertion predates #87 capping featured at 3.
  Untouched by this branch.
- The homepage FAQ, eight questions and roughly 500 words, is still unmarked up
  and is still the cheapest structured-data win on the site. This page adds
  `Organization` but nothing was added to `/`.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Stripe is sandbox (`sk_test_`). Ritvik's uncommitted `.gitignore`
change is his and was left unstaged.
