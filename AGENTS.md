# Admitfolio

Marketplace where verified `.edu` students sell their college-admission essays.
Next.js App Router, Prisma + Supabase Postgres, Stripe, Vercel.

## How to talk to me

**Keep explanations short and plain.** Lead with the answer. Skip the build-up.

- A few sentences beats a few paragraphs.
- No tables or headings unless they genuinely help.
- Plain words over jargon. If a technical term is unavoidable, say what it means in half a sentence.
- Say what changed and what it means for me. Leave out the reasoning I didn't ask for.
- Still tell me the bad news, just say it briefly.

Show me a mock-up before committing UI work. Iterate on a real-data HTML mock
under `public/` or `~/admitfolio-mockups/`, not on the app, then port what I
approve.

## Handing work between Claude Code and Codex

This project is worked on from both. The rules live here, in `AGENTS.md`, and
`CLAUDE.md` is a pointer to this file so the two cannot drift apart. If a
standing rule changes, edit this file.

`HANDOVER.md` is the other half: this file is what is always true, `HANDOVER.md`
is the state of the work in flight. When you hand work over:

1. Commit everything, in coherent commits, so nothing is stranded in the working
   tree. Do not push unless the other tool runs somewhere other than this
   machine.
2. Rewrite `HANDOVER.md`: the branch and its base, what changed and why, what is
   left, and anything you found but did not fix. Rewrite it, do not append to
   it, so a stale section can never be mistaken for current.
3. Move anything you would otherwise leave in a scratchpad into the repo. Two
   pieces of work have already been lost to ephemeral scratchpads: the
   opening-line extraction and the headless-Chrome verification scripts.
4. Record any hand-run step the deploy will not do for you, migrations aside.
   Backfills are the usual one.

## House style

- **No em dashes in site copy** (pages, admin labels, emails, watermarks). Use a
  full stop, comma, or parentheses. Students' own writing keeps its punctuation:
  `Listing.teaser`, essay text, `Essay.question`.

## Things that bite

- `git push` sends code to GitHub. It does **not** deploy. Vercel deploys `main`,
  so nothing is live until it's merged there.
- Vercel's build runs `prisma migrate deploy` before `next build`, so migrations
  apply automatically on merge. A failed migration fails the build and leaves the
  old site up. Backfill scripts are NOT run by that, and must be run by hand.
- **`DATABASE_URL` points at the live database, and so does everything else in
  `.env`.** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `STRIPE_SECRET_KEY`
  are all production. Never run migrations or writes against them without asking.
  Reads are fine.
- **`next dev` on localhost is wired to production too.** It is not a sandbox.
  Approving a listing in the local admin console approves it for real and emails
  the seller for real.
- Do not permanently delete data. `scripts/delete-seller.mjs` exists for
  "delete my account" requests; it is dry-run by default and needs `--confirm`.

## Running it locally

`npx next dev -p 3000` works and starts in a couple of seconds.

Two stale warnings you may still find in older notes, both now false:
`@next/swc-darwin-arm64` is installed, and port 3000 is free. A third is half
true: `SESSION_SECRET` is missing from `.env`, but `lib/config.ts` only throws
when `NODE_ENV=production`, so it blocks `next build` and never `next dev`.

`NEXT_PUBLIC_LAUNCH=1` is set locally, so localhost renders the launched
catalogue. Production does not have it set, so the live site still shows the
pre-launch waitlist. Going live is that environment variable, not a code change.

## Invariants that are easy to break

- **Anonymity is per listing, not per seller** (`prisma/schema.prisma`), and
  every public surface must go through `publicDisplayName` in `lib/anonymity.ts`.
  Six sellers have different anonymity choices across their own listings, so
  anything that groups or joins listings by seller can leak a real name onto an
  anonymous one. Do not publish a seller id or any per-seller join key.
- **The unit of purchase is a listing**, never an essay. Checkout, the webhook
  and the reading page all assume it.
- **The card headline and the Stripe product name must agree.** An exact
  `targetSchool` (or the only claimed admit on a legacy listing) leads. A
  genuinely general or ambiguous package falls back to `Listing.school`, the
  university the seller currently attends, so the card always has a real
  college name and logo. `app/api/checkout/route.ts` builds the Stripe line item
  independently, so it has to change in lockstep.
- **School names are free text.** Resolve them through `lib/schools.ts`
  (`schoolInfo`, `schoolShortName`, `sameSchool`) rather than matching
  substrings. Loose matching is what once made "Penn State" price as UPenn.
- `public/browse-mockup.html` and `public/.mock-listings.json` are gitignored and
  contain real seller names and background tags. Keep them out of git, and out of
  anything that gets deployed.

## Verifying UI work

Local `next dev` plus headless Chrome over the DevTools protocol. Node 20 needs
`--experimental-websocket` for a CDP client. Assert on the DOM rather than
eyeballing a screenshot: console errors, card counts, row alignment, clipped
text, `document.fonts.check`.

**Never click "Pay with Stripe" in a verification run.** Assert on modal state.

## Where things are

| | |
|---|---|
| browse card + detail sheet + all modals | `app/page.tsx` (one large client component) |
| public catalogue API | `app/api/listings/route.ts` |
| school name resolution, logos, short names | `lib/schools.ts` |
| price floors and school tiers | `lib/pricing.ts` |
| anonymity rules | `lib/anonymity.ts` |
| AI review panel and its cron | `lib/review.ts`, `app/api/cron/review/route.ts` |
| account deletion tool | `scripts/delete-seller.mjs` |
| approved mock-ups | `~/admitfolio-mockups/` (gallery at `index.html`) |
