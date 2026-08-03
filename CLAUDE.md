# Admitfolio

Marketplace where verified `.edu` students sell their college-admission essays.
Next.js App Router, Prisma + Supabase Postgres, Stripe, Vercel.

## How to talk to me

**Keep explanations short and plain.** Lead with the answer. Skip the build-up.

- A few sentences beats a few paragraphs.
- No tables or headings unless they genuinely help.
- Plain words over jargon. If a technical term is unavoidable, say what it means in half a sentence.
- Say what changed and what it means for me. Leave out the reasoning I didn't ask for.
- Still tell me the bad news — just say it briefly.

## House style

- **No em dashes in site copy** (pages, admin labels, emails, watermarks). Use a full stop, comma, or parentheses. Students' own writing keeps its punctuation: `Listing.teaser`, essay text, `Essay.question`.

## Things that bite

- `git push` sends code to GitHub. It does **not** deploy. Vercel deploys `main`, so nothing is live until it's merged there.
- Vercel's build runs `prisma migrate deploy` before `next build`, so migrations apply automatically. A failed migration fails the build and leaves the old site up.
- `DATABASE_URL` points at the **live** database. Never run migrations or writes against it without asking.
- Local `next dev` is broken (missing `@next/swc-darwin-arm64`) and a local build stops on `SESSION_SECRET`. Check real behaviour on a Vercel preview deploy.
