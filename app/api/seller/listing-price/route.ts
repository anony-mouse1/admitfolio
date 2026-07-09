import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { admitsTier, packageFloor, perEssayFloor, TIER } from '@/lib/pricing';

export const runtime = 'nodejs';

// Edit a listing's pricing from the dashboard. The same tier floors the wizard
// shows are enforced here, so they can't be bypassed with a direct request.

export async function POST(req: Request) {
  const seller = currentSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { listingId?: string; packagePrice?: number; essayPrices?: Record<string, number> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const listingId = String(body?.listingId || '');
  const listing = listingId
    ? await prisma.listing.findUnique({
        where: { id: listingId },
        include: { seller: true, essays: { orderBy: { sortOrder: 'asc' } } },
      })
    : null;
  if (!listing || listing.seller.email !== seller.email) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }

  let admits: string[] = [];
  try {
    const parsed = JSON.parse(listing.admitTags);
    if (Array.isArray(parsed)) admits = parsed;
  } catch {
    /* no admits, no floor */
  }
  const tier = admitsTier(admits);

  if (listing.pricingMode === 'package') {
    const price = Math.round(Number(body?.packagePrice));
    if (!Number.isFinite(price) || price < 1) {
      return NextResponse.json({ error: 'Enter a valid package price.' }, { status: 400 });
    }
    const floor = tier ? packageFloor(tier, listing.essays.length) : 1;
    if (price < floor) {
      return NextResponse.json(
        { error: `Your ${TIER[tier!].label} floor is $${floor}. You can charge that or more.` },
        { status: 400 },
      );
    }
    await prisma.listing.update({ where: { id: listing.id }, data: { packagePrice: price } });
    return NextResponse.json({ ok: true, packagePrice: price });
  }

  // Separate pricing: update each essay's price.
  const essayPrices = body?.essayPrices || {};
  const floor = tier ? perEssayFloor(tier) : 1;
  const updates: { id: string; price: number }[] = [];
  for (const essay of listing.essays) {
    const raw = essayPrices[essay.id];
    if (raw == null) continue;
    const price = Math.round(Number(raw));
    if (!Number.isFinite(price) || price < 1) {
      return NextResponse.json({ error: 'Enter a valid price for every essay.' }, { status: 400 });
    }
    if (price < floor) {
      return NextResponse.json(
        { error: `Each essay's floor at ${TIER[tier!].label} is $${floor}. You can charge that or more.` },
        { status: 400 },
      );
    }
    updates.push({ id: essay.id, price });
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No prices to update.' }, { status: 400 });
  }
  await prisma.$transaction(
    updates.map((u) => prisma.essay.update({ where: { id: u.id }, data: { price: u.price } })),
  );
  return NextResponse.json({ ok: true, essayPrices: Object.fromEntries(updates.map((u) => [u.id, u.price])) });
}
