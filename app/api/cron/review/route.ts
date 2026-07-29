import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { CRON_SECRET } from '@/lib/config';
import { fetchEssayPdfsBase64, runReviewPanel } from '@/lib/review';
import { applyListingDecision } from '@/lib/listingDecision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The panel makes several Claude calls over PDFs per listing; give it room.
// 60s is the ceiling on Vercel's Hobby plan (Pro allows 300) - raise this if
// the project is upgraded, together with the cron cadence in vercel.json.
export const maxDuration = 60;

// How many pending submissions to screen per invocation. Each listing is
// committed as it finishes, so if the run hits maxDuration mid-batch the
// already-screened listings are saved and the rest keep aiReviewedAt = null,
// so the next run picks them up. Safe to leave above what one run can finish.
const BATCH_SIZE = 5;

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

  let approved = 0;
  let flagged = 0;
  let errored = 0;

  for (const listing of listings) {
    try {
      const pdfs = await fetchEssayPdfsBase64(listing);
      const result = await runReviewPanel(listing, pdfs);

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

      if (result.decision === 'approved') {
        // Flip status live + email the seller, via the shared decision path.
        await applyListingDecision(listing.id, 'approved', null);
        approved++;
      } else {
        flagged++;
      }
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
      errored++;
    }
  }

  return NextResponse.json({
    ok: true,
    reviewed: listings.length,
    approved,
    flagged,
    errored,
  });
}
