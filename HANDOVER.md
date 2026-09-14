# Handover: the checkout stack, one screen plus the Back button

Read `AGENTS.md` first. This file records only the current work in flight.

## Branches and bases

Two branches, stacked. The lower one has to land first.

- **`ritvik/checkout-one-screen`**, on `origin/main` at `4a9026d` (#87 merged).
  Open as **PR #88** against `main`. Seven commits through
  `Do not let a soft keyboard Go key mount Stripe`, plus one new local commit
  fixing what Codex found on the PR. That new commit is **not pushed**: Ritvik
  wants to look first.
- **`ritvik/checkout-back-button`**, open as **PR #89** against `main`. It was
  on `origin/main` at `4a9026d` and has been **rebased onto
  `ritvik/checkout-one-screen`**, because both branches rewrite the same part
  of `components/ListingCheckout.tsx` and they cannot merge independently.

Both branches are pushed. Neither of the local commits above is.

**Two things about #89 are now Ritvik's call and nobody else's.** The rebase
rewrote its two commits, so pushing it needs `--force-with-lease`. And its base
on GitHub is still `main`, so the PR currently shows #88's commits inside it;
either retarget #89 at `ritvik/checkout-one-screen`, or merge #88 first and
then push #89.

## Why the Back button work exists

Browse, open a listing, unlock, close checkout by any means, press Back, and
Back took you forward into the payment screen.

`closeBuy` pushed a `?listing=` entry where `closeDetail` pops. The stack read
browse, listing, checkout, listing, with the visitor on the last of those, so
the entry behind them was the checkout they had just closed.

## Why the Codex commit exists

Fatimah ran Codex over #88 and #89. Three findings, all reproduced in a browser
before anything was changed, all fixed on `ritvik/checkout-one-screen`.

**Reopening the dialog created a Stripe Checkout Session nobody asked for.**
This is the "race" finding, and it is not a race: it is deterministic and it
fires on every reopen. The reset that empties the field ran in an effect
guarded on `open`, so closing left `mountedEmail` set. React runs a child's
effects before its parent's, so the first commit after a reopen rendered with
the previous address still there and `EmbeddedListingCheckout`'s mount effect
fired before the reset cleared it. One frame, one real session, one Link SMS to
anyone whose number is on a Link account, for a dialog whose email field the
buyer could see was empty.

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
reachable. The mount is now dropped on failure and the control comes back
saying **Try again**, with the address still in the field.

**The control had a disabled state it should never have had.** `aria-disabled`
announced "unavailable" about a button that took the click and answered every
time, and the half opacity and default cursor said the same thing to everyone
who could see it. Both are gone. It always does something: a valid address
mounts the payment form, an empty or malformed one says why.

Making the button honest was only half of it, so the field's message is now a
live region (`role="alert"`) that the input points at with `aria-describedby`.
It used to be a red line only sighted buyers could read. `aria-invalid` marks a
bad **address** and not a failed request, since the field keeps its valid tick
through a 429.

**Not changed, deliberately.** Checkout Email Submitted still fires on blur with
a valid address, unchanged since 7 Sep, so the two weeks of funnel numbers the
whole PR is argued from stay comparable. Codex wanted it moved to the Continue
click. The review panel copy is untouched; Fatimah confirmed she checked those
by email before the upload flow existed, so the claim holds even where the
database row is missing.

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

## Verification completed

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

**`scripts/verify-checkout-one-screen.mjs`**, new. Both mounts (homepage and a
collection page) at 390 and 1440, at landing, empty click, mid-type, mounted and
reopen, plus the retry at both widths and the close-and-reopen gesture five
times over. It counts Stripe sessions rather than trusting the DOM, by wrapping
`createEmbeddedCheckoutPage`. One live `/api/checkout` call per run, cached in
`sessionStorage`, because the throttle is 8 a minute and every call bills a real
sandbox session.

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

## What is left, and whose it is

1. **Ritvik: look at both branches.** Then push #88's new commit, and
   force-push #89 with `--force-with-lease`, having first decided whether to
   retarget #89 at `ritvik/checkout-one-screen` or to merge #88 first.
2. **`HANDOVER.md` on `ritvik/checkout-one-screen` is stale.** It still
   describes the merged collection pages work, because that is what `main`
   carries. It was left alone rather than edited, to keep #88's diff about
   checkout. This file, on the tip of the stack, is the current one.
3. No hand-run step. No migration, no backfill.

## Found but not fixed

Everything under here was verified, none of it was changed.

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
- **`.ecard-unlock` is a `div` with an `onClick`,** no `role`, no `tabIndex`,
  no key handler (`components/PublicListingCard.tsx:38`). The card around it is
  a proper `role="button"` with Enter and Space. So a keyboard user can open a
  listing but cannot unlock one from the catalogue. Pre-existing.
- **Two links share `.home-see-more`** since the collections band shipped. The
  band's goes to `/essays`, Featured's opens the catalogue in place. Styling
  reuse, not a bug, but `document.querySelector('.home-see-more')` picks the
  wrong one.
- **Four layers patch `history.pushState` on every page:** this repo's callers
  sit under Next's App Router, Vercel Analytics and Vercel Speed Insights.
  Next's own `replaceState` runs immediately after each of our pushes and
  spreads the existing state, which is why `{ checkout: id }` survives. That is
  load-bearing for the Forward restore and is asserted.
- **`openBuy` builds its URL from `new URL('/', origin)`,** so it drops the
  hash. `#browse` is restored by the `back()` and nothing observable breaks,
  but a shared or reloaded `?checkout=` link loses the catalogue view.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Next 16.3's dev server appends a generated block to `AGENTS.md` on
every `npx next dev` start; check `git status` for it and revert before
committing. Ritvik's uncommitted `.gitignore` change is his and was left
unstaged.
