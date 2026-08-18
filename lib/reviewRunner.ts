import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  fetchAdmitProofPdfsBase64,
  fetchEssayPdfsBase64,
  runReviewPanel,
} from '@/lib/review';
import { applyListingDecision } from '@/lib/listingDecision';

export type ReviewOutcome = 'accepted' | 'flagged' | 'errored' | 'deferred' | 'skipped';

// A Vercel function may run for five minutes. Do not let the cron start a
// duplicate while an immediate upload-triggered review is still alive, but do
// recover automatically if that function is terminated without clearing its
// lease.
export const REVIEW_LEASE_MS = 10 * 60 * 1000;

// The automated panel annotates submissions for a human. It never publishes or
// emails a seller on its own.
const AUTO_APPROVE = false;

export function reviewLeaseCutoff(now = new Date()): Date {
  return new Date(now.getTime() - REVIEW_LEASE_MS);
}

// Review one complete listing. The atomic lease makes this safe to call from
// both the final PDF upload and the recurring cron without paying for duplicate
// Claude calls or racing two verdict writes.
export async function reviewListing(listingId: string): Promise<ReviewOutcome> {
  const claimedAt = new Date();
  const claim = await prisma.listing.updateMany({
    where: {
      id: listingId,
      status: 'pending',
      aiReviewedAt: null,
      OR: [
        { aiReviewStartedAt: null },
        { aiReviewStartedAt: { lt: reviewLeaseCutoff(claimedAt) } },
      ],
      essays: { every: { pdfPath: { not: null } }, some: {} },
    },
    data: { aiReviewStartedAt: claimedAt },
  });
  if (claim.count === 0) return 'skipped';

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      sellerId: true,
      school: true,
      targetSchool: true,
      applicationSystem: true,
      major: true,
      appliedMajors: true,
      admitTags: true,
      essays: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, prompt: true, question: true, wordCount: true, pdfPath: true },
      },
    },
  });

  if (!listing) {
    // The listing was deleted after the claim. There is nothing left to release.
    return 'skipped';
  }

  try {
    const pdfs = await fetchEssayPdfsBase64(listing);
    const proofRows = await prisma.admitProof.findMany({
      where: { sellerId: listing.sellerId },
      select: { id: true, schoolLabel: true, pdfPath: true },
    });
    const proofs = await fetchAdmitProofPdfsBase64(proofRows);
    const result = await runReviewPanel(listing, pdfs, proofs);

    // Authentication, rate limits, provider outages, and credit problems are
    // not verdicts about the seller. Release the lease so the cron retries.
    if (result.decision === 'retry') {
      await prisma.listing.updateMany({
        where: { id: listing.id, aiReviewedAt: null, aiReviewStartedAt: claimedAt },
        data: { aiReviewStartedAt: null },
      });
      return 'deferred';
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        aiReviewStartedAt: null,
        aiReviewedAt: new Date(),
        aiDecision: result.decision,
        aiConfidence: result.confidence,
        aiReasons: result.reasons || null,
        aiSuggestion: result.suggestion,
        aiLenses: result.lenses.length ? JSON.stringify(result.lenses) : null,
      },
    });

    for (const check of result.admitChecks) {
      await prisma.admitProof
        .update({
          where: { id: check.proofId },
          data: {
            aiCheckedAt: new Date(),
            aiGenuine: check.looksGenuine,
            aiNote: check.note,
          },
        })
        .catch(() => {});
    }

    if (result.decision !== 'approved') return 'flagged';
    if (!AUTO_APPROVE) return 'accepted';
    await applyListingDecision(listing.id, 'approved', null);
    return 'accepted';
  } catch (error) {
    // A corrupt or unreadable submission must not occupy the queue forever.
    // Surface the failure to the admin as a low-confidence flag.
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`review failed for listing ${listing.id}:`, message);
    await prisma.listing
      .update({
        where: { id: listing.id },
        data: {
          aiReviewStartedAt: null,
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
