import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The logged-in seller's listings with per-listing and per-essay sales
// aggregates, for the dashboard.

export async function GET() {
  const seller = currentSeller();
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.listing.findMany({
    where: { seller: { email: seller.email } },
    orderBy: { createdAt: 'desc' },
    include: { essays: { orderBy: { sortOrder: 'asc' } } },
  });

  const purchases = await prisma.purchase.findMany({
    where: { listingId: { in: rows.map((l) => l.id) } },
    select: { listingId: true, essayId: true, amount: true, createdAt: true },
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthGross = purchases
    .filter((p) => p.createdAt >= monthStart)
    .reduce((sum, p) => sum + p.amount, 0);

  const listings = rows.map((l) => {
    const forListing = purchases.filter((p) => p.listingId === l.id);
    return {
      id: l.id,
      school: l.school,
      status: l.status,
      pricingMode: l.pricingMode,
      packagePrice: l.packagePrice,
      adminNote: l.adminNote,
      createdAt: l.createdAt,
      sales: forListing.length,
      gross: forListing.reduce((sum, p) => sum + p.amount, 0),
      essays: l.essays.map((e) => {
        const forEssay = forListing.filter((p) => p.essayId === e.id);
        return {
          id: e.id,
          prompt: e.prompt,
          question: e.question,
          price: e.price,
          sales: forEssay.length,
          gross: forEssay.reduce((sum, p) => sum + p.amount, 0),
        };
      }),
    };
  });

  return NextResponse.json({ listings, monthGross });
}
