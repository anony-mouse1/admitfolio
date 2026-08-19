import 'server-only';
import { prisma } from '@/lib/prisma';
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
  opts: { human?: boolean } = {},
): Promise<{ ok: true; status: string } | { ok: false; error: 'not_found' }> {
  const existing = await prisma.listing.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return { ok: false, error: 'not_found' };

  const listing = await prisma.listing.update({
    where: { id },
    data: {
      status: decision,
      // Only overwrite when a note was actually supplied - re-confirming a
      // decision with an empty box shouldn't wipe the note you left last time.
      ...(note ? { adminNote: note } : {}),
      reviewedAt: new Date(),
      ...(opts.human ? { humanReviewedAt: new Date() } : {}),
    },
    include: {
      seller: { select: { email: true } },
      essays: { select: { prompt: true, question: true } },
    },
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
