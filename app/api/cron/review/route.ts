import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { CRON_SECRET } from '@/lib/config';
import { reviewLeaseCutoff, reviewListing, type ReviewOutcome } from '@/lib/reviewRunner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The panel makes several Claude calls over PDFs per listing; give it room.
// 300s is the Pro ceiling (Hobby caps at 60); the project is on Pro, so this
// no longer has to sit at the 60 that f10310a was forced back down to.
//
// vercel.json runs this every 5 minutes as a fallback. New complete submissions
// start the same runner immediately from /api/upload-essay. It stayed daily
// while the panel's judgement was unproven; that hold is over - the
// decision rule was recalibrated once the first batch showed it approved
// nothing, so the backlog is worth clearing at speed. A batch of 10 takes ~27s
// of the 300s, so runs cannot overlap.
export const maxDuration = 300;

// How many pending submissions to screen per invocation. Each listing is
// committed as it finishes, so if the run hits maxDuration mid-batch the
// already-screened listings are saved and the rest keep aiReviewedAt = null,
// so the next run picks them up. Safe to leave above what one run can finish.
//
// Currently 10 - a deliberately small first batch, so a human can read every
// verdict the panel produces before the cadence is turned up. Sized for the
// test, not for throughput; on Pro this can go to ~25 (about 60s of the 300s
// budget at CONCURRENCY 5) once the panel's judgement has been spot-checked.
const BATCH_SIZE = 10;

// How many listings to screen at once. Listings were screened serially at
// ~12s each, so a 60s run only ever finished four of a batch of five; the
// wall-clock was entirely spent waiting on the API, not on us. Kept separate
// from BATCH_SIZE so the batch can grow without the fan-out growing with it:
// each listing fans out to one Claude call per lens, so in-flight requests are
// CONCURRENCY x LENSES (3), not CONCURRENCY. Every listing still commits its
// own verdict as it lands, so the mid-run timeout behaviour above is unchanged.
const CONCURRENCY = 5;

// Run `fn` over `items` with at most `limit` in flight. Workers pull from a
// shared cursor rather than running fixed slices, so one slow listing doesn't
// idle a worker that could be starting the next one. `fn` must not reject -
// reviewListing() handles its own failures - so a single bad listing
// cannot take the run down with it.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// GET /api/cron/review — invoked by Vercel Cron (see vercel.json). Gated by
// CRON_SECRET, which Vercel sends as `Authorization: Bearer <CRON_SECRET>`.
// currentAdmin() is cookie-bound and unavailable to cron, so we use the secret.
// Constant-time bearer check. `!==` short-circuits on the first differing byte,
// which is a (remote, faint) timing oracle; lib/uploadToken.ts already compares
// this way, so match it.
function authorized(header: string): boolean {
  if (!CRON_SECRET) return false; // unconfigured deploys stay closed
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${CRON_SECRET}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req.headers.get('authorization') || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pending submissions that haven't been screened yet and have all PDFs
  // uploaded. `some: {}` guards against a listing with zero essays trivially
  // satisfying `every`.
  const listings = await prisma.listing.findMany({
    where: {
      status: 'pending',
      aiReviewedAt: null,
      OR: [
        { aiReviewStartedAt: null },
        { aiReviewStartedAt: { lt: reviewLeaseCutoff() } },
      ],
      essays: { every: { pdfPath: { not: null } }, some: {} },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { id: true },
  });

  const outcomes: ReviewOutcome[] = await mapPool(listings, CONCURRENCY, (listing) =>
    reviewListing(listing.id),
  );

  const accepted = outcomes.filter((o) => o === 'accepted').length;
  const flagged = outcomes.filter((o) => o === 'flagged').length;
  const errored = outcomes.filter((o) => o === 'errored').length;
  const skipped = outcomes.filter((o) => o === 'skipped').length;
  // Nothing was written for these; they are still queued for the next run.
  // Reported separately from `errored` because they are not failures of the
  // listing - a non-zero count here means the API was struggling, not that
  // sellers submitted bad essays.
  const deferred = outcomes.filter((o) => o === 'deferred').length;

  return NextResponse.json({
    ok: true,
    selected: listings.length,
    reviewed: accepted + flagged + errored,
    accepted,
    flagged,
    errored,
    deferred,
    skipped,
    autoApproved: false,
  });
}
