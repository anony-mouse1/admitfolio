import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { admitsTier, packageFloor, perEssayFloor, priceAllowedAtFloor, schoolTier, TIER } from '@/lib/pricing';
import { catalogSchool } from '@/lib/listingSchool';

export const runtime = 'nodejs';

// Edit a listing's pricing from the dashboard. The same tier floors the wizard
// shows are enforced here, so they can't be bypassed with a direct request.

export async function POST(req: Request) {
  const seller = await currentSeller();
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
  const targetSchool = catalogSchool({
    school: listing.school,
    targetSchool: listing.targetSchool,
    admitTags: admits,
  });
  // Legacy application packages may not have one exact college. Keep their
  // original pricing behavior by using the strongest claimed admit for the
  // floor, while their public title remains application-level and truthful.
  const tier = targetSchool
    ? schoolTier(targetSchool)
    : admitsTier(admits) ?? 3;

  if (listing.pricingMode === 'package') {
    const price = Math.round(Number(body?.packagePrice));
    if (!Number.isFinite(price) || price < 1) {
      return NextResponse.json({ error: 'Enter a valid package price.' }, { status: 400 });
    }
    const floor = packageFloor(tier, listing.essays.length);
    if (!priceAllowedAtFloor(price, floor, listing.packagePrice)) {
      return NextResponse.json(
        { error: `Your ${TIER[tier].label} floor is $${floor}. You can charge that or more.` },
        { status: 400 },
      );
    }
    await prisma.listing.update({ where: { id: listing.id }, data: { packagePrice: price } });
    return NextResponse.json({ ok: true, packagePrice: price });
  }

  // Separate pricing: update each essay's price.
  const essayPrices = body?.essayPrices || {};
  const floor = perEssayFloor(tier);
  const updates: { id: string; price: number }[] = [];
  for (const essay of listing.essays) {
    const raw = essayPrices[essay.id];
    if (raw == null) continue;
    const price = Math.round(Number(raw));
    if (!Number.isFinite(price) || price < 1) {
      return NextResponse.json({ error: 'Enter a valid price for every essay.' }, { status: 400 });
    }
    if (!priceAllowedAtFloor(price, floor, essay.price)) {
      return NextResponse.json(
        { error: `Each essay's floor at ${TIER[tier].label} is $${floor}. You can charge that or more.` },
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
