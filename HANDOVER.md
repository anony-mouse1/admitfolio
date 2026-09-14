# Handover: #88 and #90 merged, #89 open

Read `AGENTS.md` first. This file records only the current work in flight.

This file replaces two handovers that collided at this path: the checkout stack
one carried by `ritvik/checkout-back-button`, and the guides-into-collections
one carried by `main`. Neither was picked over the other. Both described work
that is now partly landed, so both were rewritten around where things actually
stand.

## Where things stand

| Work | PR | State |
|---|---|---|
| Checkout on one screen | **#88** | Merged 13 Sep, `1dd2bd9` |
| Guides link into their collections | **#90** | Merged 13 Sep, `3e88554` |
| Checkout Back button | **#89** | **Open**, waiting on review |

`ritvik/checkout-back-button` is the branch this file sits on and the only one
still in flight. It was rebased onto `c0abfa1`, the tip
`ritvik/checkout-one-screen` had before #88 merged, because both branches
rewrite the same part of `components/ListingCheckout.tsx` and cannot merge
independently. It was force-pushed on 13 Sep, and `main` has since been merged
back into it to resolve this file. Its base is `main` and stays `main`.

Nothing is unpushed. No branch is waiting on anything of Ritvik's.

## The open work: why the Back button change exists

Browse, open a listing, unlock, close checkout by any means, press Back, and
Back took you forward into the payment screen.

`closeBuy` pushed a `?listing=` entry where `closeDetail` pops. The stack read
browse, listing, checkout, listing, with the visitor on the last of those, so
the entry behind them was the checkout they had just closed.

`closeBuy` now gets the `closeDetail` treatment: a `buyPushedRef`,
`history.back()` when opening pushed an entry, and `replaceState` when the
visitor arrived on a pasted or reloaded `?checkout=` link with nothing of ours
behind them. All four affordances share the one path: the back control, the x,
the mobile close pill and Escape.

Checkout has two entry points with different stacks and both are now honoured
rather than flattened. From the detail sheet it is browse, listing, checkout, so
one Back reopens the listing. From a card the sheet never opened, so it is
browse, checkout and one Back is the catalogue. The old code forced the sheet
open on both, which is what made the extra push look necessary.

## What #88 shipped, and the one thing that changed after the rebase

Fatimah ran Codex over #88 and #89. Three findings, all reproduced in a browser
before anything was changed, all fixed on `ritvik/checkout-one-screen` and all
now on `main`.

**Reopening the dialog created a Stripe Checkout Session nobody asked for.**
This is the "race" finding, and it is not a race: it is deterministic and it
fires on every reopen. The reset that empties the field ran in an effect guarded
on `open`, so closing left `mountedEmail` set. React runs a child's effects
before its parent's, so the first commit after a reopen rendered with the
previous address still there and `EmbeddedListingCheckout`'s mount effect fired
before the reset cleared it. One frame, one real session, one Link SMS to anyone
whose number is on a Link account, for a dialog whose email field the buyer
could see was empty.

The mount queue never saw a problem. It serialises Stripe objects and it did
that correctly throughout: no `IntegrationError`, no hung card. It was never
asked whether a session should exist at all, which is the question this bug
turns on.

Measured on `npx next build` plus `npx next start`, 390x844: close and reopen
spent **two sessions a round instead of one**, and the fourth round crossed the
8 per minute per IP throttle on `/api/checkout`. The reset now runs during
render, which re-renders before anything commits, so there is no frame to mount
in.

**A failed mount left nothing to try again with.** The dead mount stayed on
screen, which kept `mounted` true, which is the one condition under which the
Continue control does not render. "Could not load secure checkout. Please try
again." had nothing behind it, and the throttle above is what makes that
reachable. The mount is now dropped on failure and the control comes back saying
**Try again**, with the address still in the field.

**The control had a disabled state it should never have had.** `aria-disabled`
announced "unavailable" about a button that took the click and answered every
time, and the half opacity and default cursor said the same thing to everyone
who could see it. Both are gone. It always does something: a valid address
mounts the payment form, an empty or malformed one says why. The field's message
is now a live region (`role="alert"`) that the input points at with
`aria-describedby`. `aria-invalid` marks a bad **address** and not a failed
request, since the field keeps its valid tick through a 429.

**Checkout Email Submitted moved, and the two handovers disagreed about it.**
This is the one thing worth reading twice. The #89 handover recorded the blur
placement as deliberately kept, on the argument that leaving it on blur is what
keeps two weeks of funnel numbers comparable. `7d78774`, which went onto
`ritvik/checkout-one-screen` after this branch was rebased off it and merged as
part of #88, moved the event out of the blur handler and into the deliberate
proceed handler, on the opposite argument: that under the two-step flow the
stage meant the buyer pressed Continue or Enter, so a deliberate proceed is what
matches the baseline.

**What ships today is the proceed placement.** `commitEmail` validates and
stores the address and reports nothing; the event fires once per distinct
address when payment is deliberately started. The merge of `main` into this
branch was checked against the working tree, not inferred:
`grep -c checkoutEmailSubmitted components/ListingCheckout.tsx` is 1 and it sits
under the "Preserve the existing funnel definition" comment in the proceed
handler.

Both notes cannot be right about which placement matches the two-step baseline,
and that question is answerable from the funnel numbers rather than from the
code. It is listed under "What is left" because #89's argument leans on those
two weeks of data.

The review panel copy is untouched; Fatimah confirmed she checked those by email
before the upload flow existed, so the claim holds even where the database row
is missing.

## What #90 shipped

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

The reason it was done now: `/essays/biology` shipped on 8 Sep and five days
later Search Console still said "Discovered, currently not indexed", last crawl
N/A, referring page none detected. The seven guides indexed within a day back on
7 Sep because `/guides` links to each of them.

## What the rebase conflicted on

One place, in `components/ListingCheckout.tsx`: the order panel. #89 was written
against the two-screen checkout, where that section is a logo, an eyebrow, an
`h3`, an intro line and a `buy-summary` block. #88 replaced all of it with the
one-row `buy-order-row`. The one-screen markup wins, and the only thing #89
wanted in that hunk is the back control naming its real destination, so
`← Back to listing` became `← {backLabel}`.

`returnTo`, `backLabel` and the `modal-close` `aria-label` merged cleanly above
the conflict. `app/page.tsx`, `components/CollectionBrowser.tsx` and
`scripts/embedded-checkout.test.mjs` merged without conflict.

The later merge of `main` into this branch conflicted on this file and nothing
else. `components/ListingCheckout.tsx` and `scripts/embedded-checkout.test.mjs`
auto-merged, because #88's later commit and this branch changed different hunks.

## Verification completed

### The Back button work (#89)

Two by-hand browser scripts, both run against the rebased branch, both green.

```
npx next dev -p 3000
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
node scripts/verify-checkout-history.mjs
node scripts/verify-checkout-one-screen.mjs
```

Neither is in `package.json` and neither may go in `test:*`: they need a dev
server and a browser, and `test:*` is pure. Neither ever clicks Pay.

**`scripts/verify-checkout-history.mjs`**, from #89. `pushState`,
`replaceState`, `back` and `forward` are wrapped in
`Page.addScriptToEvaluateOnNewDocument`, so every write is attributed to the
function that made it, and a mirrored stack makes the effect of a Back
predictable. Twelve scenarios pass. Run against the pre-fix code first, where it
reproduces the bug: `then browser Back` lands on `/?checkout=` with the dialog
open.

**`scripts/verify-checkout-one-screen.mjs`**, from #88. Both mounts (homepage
and a collection page) at 390 and 1440, at landing, empty click, mid-type,
mounted and reopen, plus the retry at both widths and the close-and-reopen
gesture five times over. It counts Stripe sessions rather than trusting the DOM,
by wrapping `createEmbeddedCheckoutPage`. One live `/api/checkout` call per run,
cached in `sessionStorage`, because the throttle is 8 a minute and every call
bills a real sandbox session.

It also gates on hydration before clicking. A collection page server-renders the
dialog, so the control is on screen and inert for about 230ms under `next dev`;
clicking into that gap failed the script on something that is not what it
measures. See "Found but not fixed".

Also: `npx tsc --noEmit` clean, all 27 `test:*` pass, `pricing` and `name-leak`
pass by hand, `npx next build` succeeds. Never `npm run build`; it applies
migrations. Every new assertion in `scripts/embedded-checkout.test.mjs` was
confirmed to fail when the thing it guards is broken, 14 mutations, 14 caught;
so were the five browser checks, including putting the reset back into an effect,
which brings the reopen bug back and takes the five-round gesture from 5 sessions
to 10. No database write, no migration, no script. No email typed, no checkout
completed.

**Re-run after `main` was merged in, partly.** The merge brought in #88's later
commit and all of #90, and touched `components/ListingCheckout.tsx` and
`scripts/embedded-checkout.test.mjs` on this branch, so the checks were repeated
against the merged tree: `npx tsc --noEmit` clean, all 27 `test:*` green. The
two browser scripts and `npx next build` were **not** repeated; they need a dev
server and a browser. See "What is left".

### The guides work (#90)

- `npx tsc --noEmit` clean. All 27 `test:*` pass, plus `pricing` and `name-leak`
  by hand. `npx next build` succeeds.
- **`scripts/verify-guide-collection-links.mjs`**, not in `package.json` and not
  eligible for `test:*`: it needs a server and a browser, and `test:*` is pure.
  31 checks over 390 and 1440.
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
- No database write, no migration, no backfill. The only reads were the app's
  own public catalogue queries.

## What is left, and whose it is

1. **Fatimah: review #89.** It is the only open PR of the three and nothing
   blocks it.
2. **Ritvik: one browser pass on the merged branch.** `npx tsc --noEmit` and
   all 27 `test:*` were re-run against the merge and are green, but
   `npx next build` and `scripts/verify-checkout-history.mjs` were not: they
   need a dev server and a browser. The merge combined #88's later commit with
   this branch's changes to the same two files, and that combination has not
   been exercised in a browser.
3. **Ritvik: settle where Checkout Email Submitted belongs**, from the funnel
   numbers rather than from the code. #89's argument leans on two weeks of data
   whose comparability is exactly what the two notes disagree about. Shipped
   behaviour is the proceed placement; nothing needs changing unless the numbers
   say otherwise.
4. No hand-run step. No migration, no backfill, on any of the three.

## Found but not fixed

Everything under here was verified, none of it was changed.

### Checkout

- **A collection page ships the checkout dialog in its server-rendered HTML,**
  so "Continue to payment" is on screen and inert until React attaches: about
  230ms under `next dev`, less under `next start`, never zero. A buyer who taps
  it in that window gets nothing and has no way to know why. Pre-existing on
  both branches, and the homepage does not have it because its dialog waits on
  a client fetch of the catalogue anyway.
- **`releaseSlot`'s `setTimeout(0)` yield is not load-bearing.** Tested
  directly against Stripe.js with a real client secret: create, mount, destroy
  and create again in the same microtask turn is fine, and so is destroying an
  instance that was created but never mounted. The only thing Stripe rejects is
  **two live objects**, which is what the queue prevents. Harmless, but the
  comment claims more than the yield does.
- **Once a create throws, the page is finished.** Confirmed the same way: the
  instance that was already alive is never handed back, so nothing can destroy
  it, and every later `createEmbeddedCheckoutPage` on that page throws
  "You cannot have multiple Embedded Checkout objects" for the life of the
  document. Nothing currently reaches that state, but it is why the queue
  matters.
- **`EmbeddedListingCheckout`'s cancelled branch calls `instance.destroy()`
  raw,** outside `releaseSlot` and outside any `try`. It does not set
  `liveCheckout`, so if that destroy ever threw, the slot would leak and the
  point above would follow. Latent, not live: destroy on an unmounted instance
  was tested and does not throw.
- **`detailPushedRef` is cleared by every popstate, including one that lands on
  an entry `openDetail` pushed.** Back out of checkout to `?listing=`, then
  close the sheet: the ref is already false, so `closeDetail` replaces instead
  of popping and the next Back is a press that changes nothing visible. One
  dead press, no wrong screen. The same `history.state` trick `openBuy` now
  uses would fix it.
- **`CollectionBrowser`'s `closeCheckout` does not clear `checkoutPushedRef`
  before `history.back()`,** where `close` does. Harmless today, `onPop` clears
  it, and the ref is only true when an entry really was pushed, so the `back()`
  always lands. Asymmetric to read.
- **Four layers patch `history.pushState` on every page:** this repo's callers
  sit under Next's App Router, Vercel Analytics and Vercel Speed Insights.
  Next's own `replaceState` runs immediately after each of our pushes and
  spreads the existing state, which is why `{ checkout: id }` survives. That is
  load-bearing for the Forward restore and is asserted.
- **`openBuy` builds its URL from `new URL('/', origin)`,** so it drops the
  hash. `#browse` is restored by the `back()` and nothing observable breaks,
  but a shared or reloaded `?checkout=` link loses the catalogue view.

### Catalogue and crawling

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
  (`app/page.tsx:2408`), and `pageView` initialises to `'home'`, so the raw HTML
  contains `id="featured"` and no `#browse` anywhere. It works for a reader,
  because the mount effect reads the hash and flips the view
  (`app/page.tsx:544`). It passes nothing to anything for a crawler. Four guides
  plus the shared nav and both footers point at it. The cheap fix is `/essays`,
  which is a real page about exactly what those articles are about; it was left
  out of #90 because the brief said not to force a match.
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
- **`www.admitfolio.com` 308s to the apex**, checked on `/essays/biology`. An
  older note treated the www duplicate as open. For this path it is not.
- **Search Console access is still missing**, so none of this can be confirmed
  from the crawl side. Whether Google has recrawled `/` or `/essays` since 8 Sep
  is exactly the question that would settle why "referring page: none detected"
  was reported, and it cannot be answered from here.

### Accessibility and reuse

- **`.ecard-unlock` is a `div` with an `onClick`,** no `role`, no `tabIndex`,
  no key handler (`components/PublicListingCard.tsx:38`). The card around it is
  a proper `role="button"` with Enter and Space. So a keyboard user can open a
  listing but cannot unlock one from the catalogue. Pre-existing.
- **Two links share `.home-see-more`** since the collections band shipped. The
  band's goes to `/essays`, Featured's opens the catalogue in place. Styling
  reuse, not a bug, but `document.querySelector('.home-see-more')` picks the
  wrong one.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Next 16.3's dev server appends a generated block to `AGENTS.md` on
every `npx next dev` start; check `git status` for it and revert before
committing. Ritvik's uncommitted `.gitignore` change is his and was left
unstaged.
