import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentAdmin } from '@/lib/adminAuth';
import { sendListingDecisionNotification } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!currentAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; decision?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const id = String(body?.id || '');
  const decision = String(body?.decision || '');
  if (!id) return NextResponse.json({ error: 'Listing id required.' }, { status: 400 });
  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be approved or rejected.' }, { status: 400 });
  }

  try {
    const note = body?.note ? String(body.note) : null;
    const existing = await prisma.listing.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });

    const listing = await prisma.listing.update({
      where: { id },
      data: {
        status: decision,
        adminNote: note,
        reviewedAt: new Date(),
      },
      include: { seller: { select: { email: true } } },
    });

    // Only email the seller when the decision actually flips the status -
    // re-confirming an already-approved (or already-rejected) listing shouldn't
    // notify them again. Awaited but never fatal: the decision is already saved,
    // so a mail hiccup shouldn't fail the request or block re-review.
    if (existing.status !== decision) {
      const notify = await sendListingDecisionNotification(listing.seller.email, {
        school: listing.school,
        decision: decision as 'approved' | 'rejected',
        note,
      });
      if (!notify.ok) {
        console.error('listing decision notification failed:', notify.status, notify.detail);
      }
    }

    return NextResponse.json({ ok: true, status: listing.status });
  } catch {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }
}
