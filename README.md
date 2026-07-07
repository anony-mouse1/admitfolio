# Admitfolio

A marketplace of real college admissions essays, written by the students who got in.
Built with **Next.js (App Router) + TypeScript** and a **Prisma + SQLite** database.

## Quick start

```bash
npm install            # installs deps and generates the Prisma client
npm run db:push        # creates the SQLite database (prisma/dev.db) from the schema
cp .env.example .env   # then edit .env (see below)
npm run dev            # http://localhost:3000
```

The admin review console lives at **/admin**.

## Environment (`.env`)

See `.env.example` for the full list. The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `file:./dev.db` locally; a Postgres URL in production |
| `RESEND_API_KEY` | Sends login codes by email. If unset, codes print to the server console |
| `ADMIN_EMAILS` | Comma-separated emails allowed into `/admin` |
| `TEST_EMAILS` | Non-`.edu` emails allowed to sign up during testing (**remove before launch**) |
| `DEV_LOGIN_CODE` | Fixed code that skips real email while testing (**remove before launch**) |

## Data model (Prisma)

Defined in `prisma/schema.prisma`:

- **Seller** — a verified `.edu` account
- **Listing** — one seller's essay package for a school (has a review `status`)
- **Essay** — an individual essay inside a listing
- **WaitlistEntry** — "notify me at launch" signups
- **Purchase** — buyer checkouts (payment is stubbed)
- **LoginCode** — short-lived 6-digit OTPs

## Going to production

1. Set `provider = "postgresql"` in `prisma/schema.prisma` and point `DATABASE_URL` at a hosted Postgres (Neon, Supabase, Vercel Postgres).
2. Run `npx prisma migrate deploy`.
3. Set a real `SESSION_SECRET`, a verified-domain `FROM_EMAIL`, and remove `TEST_EMAILS` / `DEV_LOGIN_CODE`.
4. Deploy (Vercel works out of the box).

## Legacy

The original zero-dependency prototype (a single `server.js` + static HTML) is preserved in `legacy/` for reference.
