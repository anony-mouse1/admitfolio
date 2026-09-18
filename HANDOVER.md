# Handover: stop telling crawlers the marketplace has not launched

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/remove-prelaunch-waitlist`, on `origin/main` at `042e8da` (#91
merged). Committed locally, **not pushed**, no PR yet.

Branched off `main` deliberately. `ritvik/checkout-back-button`,
`ritvik/cache-collection-pages` and `ritvik/checkout-attribution` were left
untouched; all three have open work.

## Why

Google's copy of the homepage said "Coming soon" and "Be first to read the
essays that got them in" against a live catalogue of 192 buyable listings. The
markup rendered into the prerendered HTML on every page load and no visitor
could ever see it, so the only reader it ever had was a crawler.

Confirmed against production before changing anything, reads only:

| String | `https://admitfolio.com/` HTML |
|---|---|
| `Coming soon` | 1 |
| `Be first to read the essays that got them in` | 1 |
| `Join the waitlist` | 2 |
| `wl-fab` | 2 |
| `waitlistModal` | 1 |
| `Notify me when essays drop` | 1 |
| `Real admit essays are on the way` | 0 |
| `release-overlay` | 0 |

Two of those also survive in the shipped JS chunk
`/_next/static/immutable/chunks/3s4epxr2ff5hf.js`. `/essays`, `/guides`,
`/privacy` and `/terms` were clean, so this was the homepage only.

## What was removed, and what was deliberately kept

Removed, because it rendered regardless of `NEXT_PUBLIC_LAUNCH`:

- the sticky "Join the waitlist" floating button (`.wl-fab`)
- the scroll-triggered waitlist modal (`#waitlistModal`), which is where both
  reported strings lived
- their state, handlers and the 15-second popup timer: `wlOpen`, `wlEmail`,
  `wlMsg`, `wlBusy`, `fabShow`, `wlEmailRef`, `autoShownRef`, `overlayOpenRef`,
  `hasJoined`, `markJoined`, `openWaitlist`, `handleWlSubmit`
- the `admitly_waitlist_joined` localStorage key, which only ever suppressed
  those two surfaces
- their CSS, including the `.wl-fab` entries in the shared button treatment and
  the safe-area rule

Kept, untouched:

- **`/api/waitlist` and the `WaitlistEntry` table.** Real emails are in there.
  No migration, no schema change, no delete.
- **The "Releasing soon" notify banner** in the `LAUNCHED === false` branch of
  the featured section. It is the surviving signup surface and it is correctly
  gated, so a flag flip still gives visitors a way to leave an email and still
  reaches the same endpoint. Its `Coming soon` eyebrow is the one remaining
  occurrence in the source, and it is dead-code eliminated on a launched build.

Deleted rather than gated on purpose. A `LAUNCHED &&` wrapper would have been
one line, but it would ship the markup again the day the flag flipped, and the
popup was already wrong for its own pre-launch audience: `handleNotifySubmit`
and `handleWlSubmit` wrote the same row through the same endpoint, so the modal
only ever duplicated the banner sitting a screen above it.

### The flag can flip back and this is still correct

`NEXT_PUBLIC_LAUNCH` unset restores the full pre-launch featured section, its
copy and its working email capture. What does not come back is the floating
button and the scroll popup. That is the intended loss.

Worth knowing, because it is the same hazard recorded in `CLAUDE.local.md`:
`app/page.tsx` inlines the flag at build time while `lib/launch.ts` reads it at
runtime, so flipping it either way is the variable **plus a redeploy**.

## Verification completed

- `npx tsc --noEmit` clean. All 29 `scripts/*.test.mjs` pass. `npx next build`
  succeeds with an unchanged route table and `/` still prerendered static.
  Never `npm run build`; it applies migrations.
- **Served HTML, `npx next start` against the production build:** every row in
  the table above is now **0**, re-counted the same way with `curl`. The ten JS
  chunks and both CSS bundles the page loads are clean too.
- **`scripts/verify-prelaunch-removal.mjs`**, new, NOT in `package.json`: it
  needs a dev server and a browser, and `test:*` is pure. At **390 and 1440** it
  asserts the strings are absent from the raw document and from the hydrated
  DOM, scrolls past 900px and waits the old 15-second timer out to prove no
  popup fires, then checks the page still renders: three featured cards each
  with a hook, no overlap, no horizontal overflow, hero visible, both "See all"
  links present, the four crawlable footer links present, Escape still closing
  the detail sheet and releasing the body scroll lock, and no console errors.
  Mutation checked: against a build of the pre-change files it fails on the
  served HTML, and with that gate commented out it fails on the hydrated DOM.
- **Four assertions added to `scripts/launch-hardening.test.mjs`**, which is
  pure and already runs in `test:*`. Both directions were mutation checked: the
  page assertion fails against the old `app/page.tsx`, the style assertion fails
  against the old `app/globals.css`.
- Screenshots at both widths, top, featured band and footer. Nothing shifted and
  there is no gap where the floating button used to sit.
- **No database write of any kind.** The only reads were the app's own public
  catalogue queries and read-only GETs against production: the homepage, four
  other public routes and the JS chunks the homepage loads.

## What is left, and whose it is

1. **Ritvik: review, then push and open a PR.** Nothing is pushed.
2. **Fatimah: nothing to configure.** No env var, no migration, no backfill.

## Found but not fixed

- **`scripts/verify-browse-ui.mjs` is stale and was already failing before this
  branch.** Run against this build it stops at
  `Error: Unexpected nav: High schooler?|In college?`, because it still expects
  `Browse essays|Featured|Sell your essays`. Behind that, its
  `home.featured === 6` assertion is stale too: #87 moved featured under the
  collections band and capped it at `HOME_FEATURED_COUNT = 3`
  (`app/page.tsx:227`). Neither assertion touches anything this branch changed,
  but it means the browse regression check has not guarded anything since #87.
- **`app/terms/page.tsx:34` still lists "joining the waitlist"** as a way to
  accept the Terms. Still accurate, because the pre-launch banner survives, but
  it is legal copy and Fatimah's call whether it should stay once the site has
  been launched for good. Not changed on my own initiative.
- **Nothing reads `WaitlistEntry`.** The only query against it anywhere in the
  repo is the duplicate check inside its own write path. There is no admin
  screen, no export script and no email send, so whoever is on that list has
  never been told the essays went live. That is a product decision for Fatimah,
  and with the catalogue live it is also a small pool of people who asked to be
  contacted about exactly this.
- **`/api/waitlist` is still open and unauthenticated**, throttled at 6 per
  minute per IP, and it still writes to production. Removing the UI does not
  close it. Worth deciding whether it should stay reachable at all.
- The privacy policy's "If you sign up for product updates: your email address"
  is now over-disclosure on a launched site rather than a description of
  something that happens on `/`. Harmless, and it becomes accurate again the
  moment the flag flips, so it was left alone.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Stripe is sandbox (`sk_test_`). Ritvik's uncommitted `.gitignore`
change is his and was left unstaged.
