import 'server-only';
import { prisma } from '@/lib/prisma';
import { sendListingDecisionNotification } from '@/lib/email';
import { catalogSchool, parseAdmitTags } from '@/lib/listingSchool';

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
): Promise<{ ok: true; status: string } | { ok: false; error: 'not_found' | 'target_school_required' }> {
  const existing = await prisma.listing.findUnique({
    where: { id },
    select: { status: true, school: true, targetSchool: true, admitTags: true },
  });
  if (!existing) return { ok: false, error: 'not_found' };
  const existingSchool = catalogSchool({
    school: existing.school,
    targetSchool: existing.targetSchool,
    admitTags: parseAdmitTags(existing.admitTags),
  });
  if (decision === 'approved' && !existingSchool) {
    return { ok: false, error: 'target_school_required' };
  }

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
    include: { seller: { select: { email: true } } },
  });

  if (existing.status !== decision) {
    const listingSchool = catalogSchool({
      school: listing.school,
      targetSchool: listing.targetSchool,
      admitTags: parseAdmitTags(listing.admitTags),
    });
    const notify = await sendListingDecisionNotification(listing.seller.email, {
      school: listingSchool || 'your essay listing',
      decision,
      note,
    });
    if (!notify.ok) {
      console.error('listing decision notification failed:', notify.status, notify.detail);
    }
  }

  return { ok: true, status: listing.status };
}
