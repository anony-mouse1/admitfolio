# Handover: the checkout Back button

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/checkout-back-button`, on `origin/main` at `4a9026d` (#87 merged).
One commit, `8ecfcf5`. Not pushed, no PR. Ritvik wants to look first.

`ritvik/checkout-one-screen` is a separate branch with an open PR and is
deliberately not involved. Nothing from it is in here.

## Why

Browse, open a listing, unlock, close checkout by any means, press Back, and
Back took you forward into the payment screen.

`closeBuy` pushed a `?listing=` entry where `closeDetail` pops. The stack read
browse, listing, checkout, listing, with the visitor on the last of those, so
the entry behind them was the checkout they had just closed.

## What changed

**`closeBuy` gets the `closeDetail` treatment.** A `buyPushedRef`,
`history.back()` when opening pushed an entry, `replaceState` when the visitor
arrived on a pasted or reloaded `?checkout=` link with nothing of ours behind
them. The back control, the x, the mobile close pill and Escape are all one
path, so one fix covers the four.

**Both entry points are honoured rather than flattened.** From the detail sheet
the stack is browse, listing, checkout, so one Back reopens the listing. From a
card the sheet never opened, so it is browse, checkout and one Back is the
catalogue. The old code forced the sheet open on both, which is what made the
extra push look necessary.

**`ListingCheckout` takes `returnTo`** and owns both strings, so the back
control and the mobile pill's `aria-label` name the same destination and
neither caller holds copy. The collection mount passes `"listing"` explicitly:
checkout is only reachable from the open sheet there, never from a card.

**`openBuy`'s two booleans become one `origin` argument.** They were only ever
passed together. The third value, `'url'`, is the restore path that must
neither re-fire Checkout Started nor re-push the entry the visitor is already
standing on. A restore can also be a Forward back onto an entry `openBuy`
pushed earlier, so it reads that entry's own `{ checkout: id }` history state
to tell a pushed entry from a pasted link.

**`CollectionBrowser`'s `checkoutPushedRef`** was `useRef(Boolean(!initialCheckoutId))`,
true when nothing had been pushed, the opposite of its name. Now `false`, which
is correct on both entry paths. No behaviour change; the collection pages
already popped correctly and were verified to still do so.

## Verification completed

`scripts/verify-checkout-history.mjs`, new, run by hand like the other
`verify-*.mjs` scripts. It is not in `package.json` and must not go in
`test:*`: it needs a dev server and a browser, and `test:*` is pure.

```
npx next dev -p 3000
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-admitfolio about:blank
node scripts/verify-checkout-history.mjs
```

`pushState`, `replaceState`, `back` and `forward` are wrapped in
`Page.addScriptToEvaluateOnNewDocument`, so every write is attributed to the
function that made it, and a mirrored stack makes the effect of a Back
predictable. Twelve scenarios pass, nine of them the flows in the report: the
four affordances and browser Back from a card unlock, browser Back and
self-close from the detail sheet, a direct `?checkout=` URL, and browse,
listing, unlock, Back, Forward. Three more cover the collection mount.

Run against the pre-fix code first, where it reproduces the bug: `then browser
Back` lands on `/?checkout=` with the dialog open.

Also: `npx tsc --noEmit` clean, all 27 `test:*` pass, `pricing` and `name-leak`
pass by hand, `npx next build` succeeds. Never `npm run build`; it applies
migrations. Nine assertions added to `scripts/embedded-checkout.test.mjs`, each
confirmed to fail when the thing it guards is broken. No database write, no
migration, no script. No email typed, no Stripe session created.

## What is left, and whose it is

1. **Ritvik: look at the branch.** Then push and open a PR. `git push` does not
   deploy; Vercel deploys `main`.
2. No hand-run step. No migration, no backfill.

## Found but not fixed

- **`detailPushedRef` is cleared by every popstate, including one that lands on
  an entry `openDetail` pushed.** Back out of checkout to `?listing=`, then
  close the sheet: the ref is already false, so `closeDetail` replaces instead
  of popping and the next Back is a press that changes nothing visible. One
  dead press, no wrong screen. The same `history.state` trick `openBuy` now
  uses would fix it. Left alone because `closeDetail` was not in scope and is
  otherwise correct.
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
  but a shared or reloaded `?checkout=` link loses the catalogue view. Left as
  it was.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Next 16.3's dev server appends a generated block to `AGENTS.md` on
every `npx next dev` start; it did so again here and was reverted before the
commit, so check `git status` for it. Ritvik's uncommitted `.gitignore` change
is his and was left unstaged.
