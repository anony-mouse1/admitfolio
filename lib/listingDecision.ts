import 'server-only';
import { prisma } from '@/lib/prisma';
import { listingAdmissionClaims } from '@/lib/admitProof';
import { sendListingDecisionNotification } from '@/lib/email';
import { listingHeadline, parseAdmitTags } from '@/lib/listingSchool';
import { ensureListingOpeningLine } from '@/lib/openingLine';

// Apply an approve/reject decision to a listing and notify the seller.
//
// Shared by the admin console (app/api/admin/decision) and the automated
// reviewer (app/api/cron/review) so both take exactly one path: update the
// status/note/reviewedAt, and email the seller ONLY when the status actually
// flips - re-confirming an already-approved (or already-rejected) listing must
// not notify them again. The email is awaited but never fatal: the decision is
// already saved, so a mail hiccup shouldn't fail the caller or block re-review.
//
// `human` marks the decision as made by a person in the console. It stamps
// humanReviewedAt, which is what lets the console tell "the panel cleared this"
// apart from "I checked this myself" - the cron never sets it. That's also why
// confirming an already-approved listing is useful: no status flip, no second
// email to the seller, but it clears off your audit queue.
export async function applyListingDecision(
  id: string,
  decision: 'approved' | 'rejected',
  note: string | null,
  opts: { human?: boolean; actorId?: string } = {},
): Promise<{ ok: true; status: string } | { ok: false; error: 'not_found' }> {
  const existing = await prisma.listing.findUnique({
    where: { id },
    select: { status: true, sellerId: true },
  });
  if (!existing) return { ok: false, error: 'not_found' };

  const reviewedAt = new Date();
  const listing = await prisma.$transaction(async (tx) => {
    const updated = await tx.listing.update({
      where: { id },
      data: {
        status: decision,
        // Only overwrite when a note was actually supplied - re-confirming a
        // decision with an empty box shouldn't wipe the note you left last time.
        ...(note ? { adminNote: note } : {}),
        reviewedAt,
        ...(opts.human ? { humanReviewedAt: reviewedAt } : {}),
      },
      include: {
        seller: { select: { email: true } },
        essays: { select: { prompt: true, question: true } },
      },
    });

    // An admin approving any of a seller's essay listings approves that
    // seller's admission claims too. This is seller-wide by design: there is
    // no second acceptance-letter decision after the admin has signed off.
    if (decision === 'approved' && opts.human) {
      const sellerListings = await tx.listing.findMany({
        where: { sellerId: existing.sellerId },
        select: { admitTags: true, targetSchool: true },
      });
      const claimsByKey = new Map(
        sellerListings
          .flatMap((row) => listingAdmissionClaims(row.admitTags, row.targetSchool))
          .map((claim) => [claim.schoolKey, claim] as const),
      );
      if (claimsByKey.size > 0) {
        await tx.admitProof.createMany({
          data: [...claimsByKey.values()].map((claim) => ({
            sellerId: existing.sellerId,
            schoolKey: claim.schoolKey,
            schoolLabel: claim.schoolLabel,
          })),
          skipDuplicates: true,
        });
      }

      const proofs = await tx.admitProof.findMany({
        where: { sellerId: existing.sellerId },
        select: { id: true, version: true, status: true, adminNote: true },
      });
      const changingProofs = proofs.filter(
        (proof) => proof.status !== 'verified' || proof.adminNote !== null,
      );
      if (changingProofs.length > 0) {
        await tx.admitProof.updateMany({
          where: { sellerId: existing.sellerId },
          data: {
            status: 'verified',
            adminNote: null,
            reviewedAt,
          },
        });
        await tx.verificationDecision.createMany({
          data: changingProofs.map((proof) => ({
            proofId: proof.id,
            proofVersion: proof.version,
            actorType: 'admin',
            actorId: opts.actorId || null,
            status: 'verified',
            note: 'Verified automatically with admin listing approval.',
          })),
        });
      }
    }

    return updated;
  });

  // Populate the card hook before approval returns. This is best-effort: a
  // scanned or corrupt PDF still falls back to its prompt label and must not
  // block an otherwise valid publication decision.
  if (decision === 'approved') {
    const opening = await ensureListingOpeningLine(id);
    if (opening.status === 'failed') {
      console.error(`opening-line extraction failed for listing ${id}:`, opening.error);
    }
  }

  if (existing.status !== decision) {
    const listingTitle = listingHeadline({
      school: listing.school,
      targetSchool: listing.targetSchool,
      admitTags: parseAdmitTags(listing.admitTags),
      applicationSystem: listing.applicationSystem,
      essays: listing.essays,
    });
    const notify = await sendListingDecisionNotification(listing.seller.email, {
      school: listingTitle,
      decision,
      note,
    });
    if (!notify.ok) {
      console.error('listing decision notification failed:', notify.status, notify.detail);
    }
  }

  return { ok: true, status: listing.status };
}
