import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentSeller } from '@/lib/sellerAuth';
import { purchaseAccounting } from '@/lib/commerce';
import { SELLER_SHARE_BPS } from '@/lib/pricing';
import { sellerPayoutStatus } from '@/lib/sellerPayoutStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The logged-in seller's listings with per-listing and per-essay sales
// aggregates, for the dashboard.

export async function GET() {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true },
  });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.listing.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: 'desc' },
    include: { essays: { orderBy: { sortOrder: 'asc' } } },
  });

  const purchases = await prisma.purchase.findMany({
    where: {
      listingId: { in: rows.map((l) => l.id) },
      // Prototype rows have no Stripe session and local payment tests use
      // cs_test_. Neither is seller revenue. Only settled live checkouts may
      // affect earnings or payout totals shown to a real seller.
      stripeSessionId: { startsWith: 'cs_live_' },
    },
    select: {
      listingId: true,
      essayId: true,
      amount: true,
      grossAmountCents: true,
      sellerEarningsCents: true,
      platformFeeCents: true,
      sellerShareBps: true,
      currency: true,
      createdAt: true,
    },
  });

  const accountedPurchases = purchases.map((purchase) => {
    const split = purchaseAccounting(purchase);
    return { ...purchase, ...split, currency: purchase.currency || 'usd' };
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthPurchases = accountedPurchases.filter((p) => p.createdAt >= monthStart);
  const monthGrossCents = monthPurchases.reduce((sum, p) => sum + p.grossAmountCents, 0);
  const monthSellerEarningsCents = monthPurchases.reduce((sum, p) => sum + p.sellerEarningsCents, 0);
  const monthPlatformFeeCents = monthPurchases.reduce((sum, p) => sum + p.platformFeeCents, 0);
  const allTimeGrossCents = accountedPurchases.reduce((sum, p) => sum + p.grossAmountCents, 0);
  const allTimeSellerEarningsCents = accountedPurchases.reduce((sum, p) => sum + p.sellerEarningsCents, 0);
  const allTimePlatformFeeCents = accountedPurchases.reduce((sum, p) => sum + p.platformFeeCents, 0);
  const payouts = await sellerPayoutStatus(seller.id);

  const listings = rows.map((l) => {
    const forListing = accountedPurchases.filter((p) => p.listingId === l.id);
    const grossCents = forListing.reduce((sum, p) => sum + p.grossAmountCents, 0);
    const sellerEarningsCents = forListing.reduce((sum, p) => sum + p.sellerEarningsCents, 0);
    const platformFeeCents = forListing.reduce((sum, p) => sum + p.platformFeeCents, 0);
    return {
      id: l.id,
      school: l.school,
      targetSchool: l.targetSchool,
      applicationSystem: l.applicationSystem,
      status: l.status,
      pricingMode: l.pricingMode,
      packagePrice: l.packagePrice,
      admitTags: safeParse(l.admitTags),
      adminNote: l.adminNote,
      createdAt: l.createdAt,
      sales: forListing.length,
      gross: grossCents / 100,
      grossCents,
      sellerEarningsCents,
      platformFeeCents,
      essays: l.essays.map((e) => {
        const forEssay = forListing.filter((p) => p.essayId === e.id);
        const essayGrossCents = forEssay.reduce((sum, p) => sum + p.grossAmountCents, 0);
        return {
          id: e.id,
          prompt: e.prompt,
          question: e.question,
          price: e.price,
          sales: forEssay.length,
          gross: essayGrossCents / 100,
          grossCents: essayGrossCents,
          sellerEarningsCents: forEssay.reduce((sum, p) => sum + p.sellerEarningsCents, 0),
          platformFeeCents: forEssay.reduce((sum, p) => sum + p.platformFeeCents, 0),
        };
      }),
    };
  });

  return NextResponse.json({
    listings,
    currency: 'usd',
    sellerShareBps: SELLER_SHARE_BPS,
    allTimeGrossCents,
    allTimeSellerEarningsCents,
    allTimePlatformFeeCents,
    monthGross: monthGrossCents / 100,
    monthGrossCents,
    monthSellerEarningsCents,
    monthPlatformFeeCents,
    payouts,
  });
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
