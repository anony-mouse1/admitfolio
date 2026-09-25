import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { checkPrice } from '@/lib/pricing';

export const runtime = 'nodejs';

// Edit a listing's pricing from the dashboard. The same limits the form shows
// (lib/pricing checkPrice) are enforced here, so a direct request cannot get
// round them. A non-whole amount is refused, never rounded.
//
// A price change on a live listing goes straight to the listing: it does not
// send the listing back through review, and checkout reads the new price.

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

  if (listing.pricingMode === 'package') {
    const check = checkPrice(body?.packagePrice, 'package');
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    await prisma.listing.update({ where: { id: listing.id }, data: { packagePrice: check.price } });
    return NextResponse.json({ ok: true, packagePrice: check.price });
  }

  // Separate pricing: update each essay's price.
  const essayPrices = body?.essayPrices || {};
  const updates: { id: string; price: number }[] = [];
  for (const essay of listing.essays) {
    const raw = essayPrices[essay.id];
    if (raw == null) continue;
    const check = checkPrice(raw, 'essay');
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    updates.push({ id: essay.id, price: check.price });
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No prices to update.' }, { status: 400 });
  }
  await prisma.$transaction(
    updates.map((u) => prisma.essay.update({ where: { id: u.id }, data: { price: u.price } })),
  );
  return NextResponse.json({ ok: true, essayPrices: Object.fromEntries(updates.map((u) => [u.id, u.price])) });
}
