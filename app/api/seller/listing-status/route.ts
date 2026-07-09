import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';

export const runtime = 'nodejs';

// Seller self-service status changes: take a published listing down, or send
// a removed/rejected one back to the admin review queue.

export async function POST(req: Request) {
  const seller = currentSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { listingId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const listingId = String(body?.listingId || '');
  const action = String(body?.action || '');
  const listing = listingId
    ? await prisma.listing.findUnique({ where: { id: listingId }, include: { seller: true } })
    : null;
  if (!listing || listing.seller.email !== seller.email) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }

  let status: string;
  if (action === 'takedown' && listing.status === 'approved') {
    status = 'removed';
  } else if (action === 'resubmit' && ['removed', 'rejected'].includes(listing.status)) {
    status = 'pending';
  } else {
    return NextResponse.json({ error: 'That action is not available.' }, { status: 400 });
  }

  await prisma.listing.update({ where: { id: listing.id }, data: { status } });
  return NextResponse.json({ ok: true, status });
}
