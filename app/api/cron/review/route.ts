import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { CRON_SECRET } from '@/lib/config';
import { fetchEssayPdfsBase64, runReviewPanel, type ReviewableListing } from '@/lib/review';
import { applyListingDecision } from '@/lib/listingDecision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The panel makes several Claude calls over PDFs per listing; give it room.
// 300s is the Pro ceiling (Hobby caps at 60); the project is on Pro, so this
// no longer has to sit at the 60 that f10310a was forced back down to.
//
// vercel.json now runs this every 5 minutes, which is the Pro floor. It stayed
// daily while the panel's judgement was unproven; that hold is over - the
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

// Whether a clean panel verdict may push a listing live on its own.
//
// OFF: nothing the panel screens goes public or emails its seller. A listing
// it accepts is recorded as accepted and left `pending`, exactly like one it
// flags, and both wait in the admin console's "AI review" tab for a human to
// approve. The panel's role while this is false is to annotate, not to decide.
//
// The panel has never been able to auto-REJECT (see lib/review.ts) - that is a
// property of the aggregation rule, not of this flag, and flipping this back on
// does not change it. The only thing this gates is the auto-approve path.
const AUTO_APPROVE = false;

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
// screenListing() below handles its own failures - so a single bad listing
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

type PendingListing = ReviewableListing & { id: string };

// Screen one listing end to end and persist its verdict. Resolves rather than
// rejects on failure so one bad listing cannot abort its neighbours now that
// the batch runs concurrently.
//
// 'accepted' means the panel found nothing wrong. Whether that also makes the
// listing public depends on AUTO_APPROVE; the verdict recorded is the same
// either way, so turning the flag on later changes what happens next, not how
// past listings were judged.
async function screenListing(
  listing: PendingListing,
): Promise<'accepted' | 'flagged' | 'errored' | 'deferred'> {
  try {
    const pdfs = await fetchEssayPdfsBase64(listing);
    const result = await runReviewPanel(listing, pdfs);

    // The API was unreachable, so there is no judgement to record. Write nothing
    // - not even aiReviewedAt - so the listing stays in the queue and the next
    // run screens it for real. Writing here is what would strand a good essay as
    // "flagged: review error" forever, since the batch selector only picks up
    // listings with aiReviewedAt still null.
    if (result.decision === 'retry') return 'deferred';

    // Record the panel's verdict regardless of decision (aiReviewedAt also
    // stops this listing from being picked up again next run).
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        aiReviewedAt: new Date(),
        aiDecision: result.decision,
        aiConfidence: result.confidence,
        aiReasons: result.reasons || null,
        aiSuggestion: result.suggestion,
        aiLenses: result.lenses.length ? JSON.stringify(result.lenses) : null,
      },
    });

    if (result.decision !== 'approved') return 'flagged';
    // Hold for a human unless auto-approve is switched on. Skipping this call
    // is what keeps the listing `pending` AND keeps the seller's inbox quiet -
    // applyListingDecision is the only thing that emails them.
    if (!AUTO_APPROVE) return 'accepted';
    // Flip status live + email the seller, via the shared decision path.
    await applyListingDecision(listing.id, 'approved', null);
    return 'accepted';
  } catch (e) {
    // Mark it reviewed-and-flagged so a deterministic failure (e.g. a corrupt
    // PDF) doesn't loop forever; the admin sees it flagged with the reason.
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error(`cron review failed for listing ${listing.id}:`, message);
    await prisma.listing
      .update({
        where: { id: listing.id },
        data: {
          aiReviewedAt: new Date(),
          aiDecision: 'flagged',
          aiConfidence: 'low',
          aiReasons: `Automated review failed: ${message}`,
          aiSuggestion: null,
          aiLenses: null,
        },
      })
      .catch(() => {});
    return 'errored';
  }
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
      essays: { every: { pdfPath: { not: null } }, some: {} },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: {
      id: true,
      school: true,
      major: true,
      appliedMajors: true,
      admitTags: true,
      essays: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, prompt: true, question: true, wordCount: true, pdfPath: true },
      },
    },
  });

  const outcomes = await mapPool(listings, CONCURRENCY, screenListing);

  const accepted = outcomes.filter((o) => o === 'accepted').length;
  const flagged = outcomes.filter((o) => o === 'flagged').length;
  const errored = outcomes.filter((o) => o === 'errored').length;
  // Nothing was written for these; they are still queued for the next run.
  // Reported separately from `errored` because they are not failures of the
  // listing - a non-zero count here means the API was struggling, not that
  // sellers submitted bad essays.
  const deferred = outcomes.filter((o) => o === 'deferred').length;

  return NextResponse.json({
    ok: true,
    selected: listings.length,
    reviewed: listings.length - deferred,
    accepted,
    flagged,
    errored,
    deferred,
    // Explicit so a run's output says whether anything went live, rather than
    // leaving it to be inferred from the deployed constant.
    autoApproved: AUTO_APPROVE,
  });
}
