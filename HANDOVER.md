# Handover: which page earned the sale

Read `AGENTS.md` first. This file records only the current work in flight.

## Branch and base

Branch: `ritvik/checkout-attribution`, on `origin/main` at `042e8da` (#91
merged). Committed locally, **not pushed**, no PR yet.

Branched off `main` deliberately. `ritvik/checkout-back-button` and
`ritvik/cache-collection-pages` were left untouched; note that #91 merged
`ritvik/cache-collection-pages` into `main` on 14 Sep, so its PR is closed.

## Why

Fatimah has twice said success means people finding the site through search and
buying, and has asked directly which pages drive purchases. Nine sales all time
and nothing joins any of them to where the buyer came from. Vercel Analytics
records the funnel but knows nothing about a Stripe payment, and the `Purchase`
row records the money but not the journey.

## What changed

Four attribution fields ride along on the `/api/checkout` request that already
happens, into the Stripe Checkout Session metadata and onto the PaymentIntent.
No schema change, no migration, no new storage, no new request.

| Metadata key | What it holds |
|---|---|
| `landingPage` | Path of the FIRST page of the session, e.g. `/essays/engineering` |
| `landingReferrer` | The external site that sent them, host plus path, e.g. `www.google.com/search` |
| `landingUtm` | `source=...&medium=...&campaign=...` off the landing URL |
| `checkoutPage` | Path the buyer pressed Unlock on |

Empty fields are omitted rather than sent blank, so a direct visit shows two
rows in the Dashboard and not four with two of them empty.

- **`lib/visitSource.ts`**, new. Pure, client-safe, no React, so every rule is
  unit testable without a browser, the same shape as `lib/analyticsPolicy.ts`.
- **`components/VisitSource.tsx`**, new. Renders nothing. Mounted in
  `app/layout.tsx`, which is the one client component on every route, so it
  covers `/`, `/essays`, the six collections, the seven guides and the legal
  pages without touching any of them.
- **`lib/commerce.ts`**: `sourceMetadata()` plus a sixth optional argument to
  `checkoutSessionParams`. With no source passed the output is byte identical to
  before, which is why the existing `deepEqual` in `scripts/commerce.test.mjs`
  still passes unchanged.
- **`app/api/checkout/route.ts`**: passes `body.source` through. Eight lines.
- **`components/EmbeddedListingCheckout.tsx`**: one field added to the POST
  body. This is the single implementation behind BOTH mounts, the homepage and
  the collection pages, so neither surface needed its own change.

**Checkout Email Submitted and Checkout Payment Loaded were not touched.** Both
were asserted still firing in the browser run.

### `checkoutPage` is not the same question as `landingPage`

`landingPage` is what search or a link earned. `checkoutPage` is where the money
changed hands. Together they separate "the collection page sold it outright"
from "the collection page fed the homepage", which is the case the whole design
exists for.

### First write wins, and it is the entire mechanism

`VisitSource` runs on every route. Writing every time would overwrite
`/essays/engineering` with `/` the moment the buyer clicked through, and credit
the homepage for a sale the collection page earned. `recordLanding` therefore
writes only when the key is absent, and writes even when every field comes out
empty so an unreadable first page cannot leave the slot open for the second.

Worth knowing for anyone testing this: on a **soft** navigation Next keeps the
root layout mounted, so the effect never re-runs and the record survives whether
or not first write wins exists. It is a **hard** navigation, a reload or a typed
URL, that remounts the layout with `sessionStorage` still full. The browser
script exercises both legs for that reason; the soft-only version of the test
passed against a deliberately broken build.

### sessionStorage, not a cookie and not localStorage

Per tab, per origin, cleared when the tab closes, which is exactly "session". It
survives soft navigations, hard navigations and reloads. A cookie would be read
server side for free but the privacy policy advertises cookieless analytics, and
`localStorage` would turn "this session" into "the first time they ever visited"
and behave like a durable identifier.

## Privacy, and the one that actually mattered

Both the landing URL and the referrer go through the existing
`lib/redactAnalyticsUrl.ts` before anything leaves the browser.

**A buyer reading an essay they already bought sits on
`/purchase/<accessToken>`**, an HMAC bearer credential valid for a year
(`lib/accessToken.ts`) that alone authorises `/api/essay/<id>`. If they buy a
second listing from there, the raw landing URL IS that token, and without
redaction it would be written into Stripe metadata where every Dashboard user
can read it. It now records as `/purchase/[token]`, which is the useful answer
anyway. Asserted, and the assertion was confirmed to fail without the redactor.

The referrer's **query string is dropped rather than redacted**. It is the part
most likely to carry someone else's personal data, a webmail message id or an
internal tool's search terms, and none of it answers "which site sent them". The
host and path are kept, because `reddit.com/r/ApplyingToCollege/comments/...` is
exactly the referrer worth knowing about.

Same-origin referrers are dropped too. `next.config.js` sends
`Referrer-Policy: no-referrer`, so our own pages cannot produce one today, but
that header is one edit away from changing and this is where the token would
arrive if it did.

No new processor. Stripe already receives the buyer's email and IP.

## Stripe's limits, measured not recalled

Probed against the sandbox rather than quoted from memory:

- **50 keys** per object. 51 is rejected. This adds at most 4, taking the
  session from 6 to 10 and the PaymentIntent from 3 to 7.
- **40 characters** per key name. 41 is rejected. The longest key here is 15.
- **500 characters** per value, counted in **Unicode code points**, not bytes
  and not UTF-16 units: 500 emoji at 2000 bytes were accepted, 501 CJK at 1503
  bytes were not.
- Exceeding any of them is a 400 on `param=metadata` that fails the **whole**
  `sessions.create` call, which `/api/checkout` catches and turns into a 502 the
  buyer reads as "Could not start checkout. Please try again."

- There is **no aggregate cap**. 50 keys at 500 characters each, 25,000
  characters in one object, was accepted.

So every value is clamped **on the server**, in `lib/commerce.ts`, rather than
trusted from the client. Confirmed the hazard is real: with both clamps removed,
a 9000 character referrer produced `stripe checkout create failed: Metadata
values can have up to 500 characters, but you passed in a value that is 9012
characters` and the buyer got the 502. With the clamp in place the same referrer
stores exactly 400 characters and checkout mounts normally.

### Why the clamp is 400 and not 500 or 200

Measured against the real routes, not chosen for being round. The first draft
used 200 and the measurement is what moved it.

| Field | Longest real value |
|---|---|
| `landingPage`, `checkoutPage` | **51**, `/guides/how-to-take-inspiration-from-college-essays` |
| `landingUtm` | **125** for a long but plausible campaign, 57 for a newsletter send, 28 for plain organic |
| `landingReferrer` | **192** for a long r/ApplyingToCollege thread |

Our own paths are bounded and enumerable: 20 public routes, and the one that
looks unbounded, `/purchase/<token>`, redacts to 17 characters. So `landingPage`
and `checkoutPage` can never truncate.

The referrer is the only field with no ceiling, and it set the floor. 192 under a
200 clamp is 8 characters of room, and r/ApplyingToCollege is an obvious traffic
source for this product rather than a contrived example. 400 is double the
longest thing measured and still 100 short of Stripe's hard limit, so no
discrepancy between how Node counts code points and how Stripe counts them can
turn an attribution field into a failed purchase. Nothing is bought by keeping
the margin small, because there is no aggregate cap.

Both numbers are asserted in `scripts/visit-source.test.mjs` against the real
`collections` and `guides` registries, so a seventh collection or a long guide
slug that ate the margin fails a test rather than silently truncating in
production. Confirmed: lowering the clamp to 380 fails the referrer assertion
and lowering it to 200 fails the path assertion.

## Where Fatimah reads it

**Stripe Dashboard > Transactions > Payments > click the payment > right hand
rail, "Metadata".** Confirmed by inspecting a real sandbox payment page, not
assumed.

This is why the fields are mirrored onto `payment_intent_data.metadata` and not
just the session. **A Checkout Session has no Dashboard page at all**: a direct
`/checkout/sessions/<id>` URL bounces to the home screen, and "Review sessions"
under Checkout opens a visual preview of the payment page rather than the
object. Session metadata is readable only through the API or Workbench. The
PaymentIntent is the copy a human can find.

The panel sorts keys alphabetically, which is why the three landing fields share
a prefix: they land together as `landingPage`, `landingReferrer`, `landingUtm`.

## Verification completed

- `npx tsc --noEmit` clean. All 30 `scripts/*.test.mjs` pass. `npx next build`
  succeeds with an unchanged route table, `/` still prerendered static. Never
  `npm run build`; it applies migrations.
- **`scripts/visit-source.test.mjs`**, new, wired into `package.json` as
  `test:visit-source`. Pure, so it qualifies as a `test:*`. 13 mutations were
  run against it and **13 were caught**, including first write wins removed, the
  landing page read unredacted, the referrer keeping its query, the clamp
  removed, the clamp slicing UTF-16 units instead of code points, arbitrary
  client keys spread into metadata, and the PaymentIntent mirror dropped. The
  margin assertions were confirmed too: 380 fails, 200 fails.
- **`scripts/verify-checkout-attribution.mjs`**, new, NOT in `package.json` and
  not eligible for `test:*`: it needs a dev server, a browser and the Stripe
  sandbox, and `test:*` is pure. 43 checks over five scenarios, each creating a
  **real sandbox Checkout Session** and reading the metadata back through the
  API. Unlike `verify-checkout-one-screen.mjs` it does not stub `/api/checkout`,
  because the metadata under test only exists on a session Stripe really made.
  - homepage landing, homepage checkout (homepage mount)
  - collection landing, collection checkout (collection mount)
  - collection landing, soft nav to `/`, hard load of `/`, checkout on `/`.
    **The collection page gets the credit.**
  - empty referrer: request succeeds, key omitted rather than blank
  - 9000 character referrer: request succeeds, stored at exactly 400
  - every session asserted still `unpaid` at the end
  - both untouched analytics events asserted still firing
- **No checkout was ever completed and "Pay" was never clicked**, so no
  `Purchase` row was created. No database write of any kind; the only reads were
  the app's own public catalogue queries.

## What is left, and whose it is

1. **Ritvik: review, then push and open a PR.** Nothing is pushed.
2. **Fatimah: nothing to configure.** The keys appear on the next real payment
   with no dashboard setup, no env var and no migration.
3. No hand-run step. No migration, no backfill.

## Found but not fixed

- **The PaymentIntent copy cannot be verified from a browser run.** Stripe
  creates the PaymentIntent only when a buyer starts paying, so `payment_intent`
  is `null` on every session the script makes, and reading that copy back would
  require completing a checkout. It is asserted against `checkoutSessionParams`
  in the unit test instead. Stripe's copying of `payment_intent_data.metadata`
  onto the PaymentIntent has been load bearing in production since checkout v2
  for `checkoutVersion`, `purchaseUnit` and `listingId`.
- **Nothing reads this back into the product.** It answers "which page drove
  this sale" one payment at a time in the Stripe Dashboard. There is no report,
  no rollup, and at 9 sales none is needed yet. When it is, the natural next
  step is a `Purchase` column written by the webhook from the same metadata,
  which IS a schema change and was deliberately out of scope here.
- **Attribution is per session, not per person.** A buyer who finds
  `/essays/engineering` on Monday, closes the tab, and returns directly on
  Friday is recorded as a direct visit. Fixing that needs `localStorage` or a
  cookie, which is a different privacy conversation.
- **A hard navigation before hydration mis-attributes.** `VisitSource` records
  from an effect, so a click landing inside the roughly 230ms before React
  attaches produces a new document whose own mount wins the empty slot. Rare,
  and the alternative is an inline `<script>` in `<head>`, which trades testable
  TypeScript for untested inline JS.
- **The referrer is only as good as the sender's policy.** Google sends its
  origin, so `landingReferrer` will read `www.google.com` and never the query.
  Our own `Referrer-Policy: no-referrer` does NOT reduce this: it governs
  referrers we send, not ones we receive.
- **The five sandbox Checkout Sessions from each verification run stay open**
  until Stripe expires them. They are unpaid and unpayable without a card.
- `/api/checkout` throttles at 8 per minute per IP and a verification run spends
  5, so two runs inside one minute will 429. That is the throttle working.

## Environment

Unchanged. `DATABASE_URL` points at the production Supabase project. Reads are
authorized, writes are not. There is no `.env` and no `prisma/.env`; do not
create one. Stripe is sandbox (`sk_test_`). Next 16.3's dev server appended its
generated block to `AGENTS.md` on `npx next dev` start, as it does; it was
reverted before committing. Ritvik's uncommitted `.gitignore` change is his and
was left unstaged.
