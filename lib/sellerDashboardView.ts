import 'server-only';
import { prisma } from './prisma';
import { purchaseAccounting, purchaseAccountingPending } from './commerce';
import { SELLER_SHARE_BPS } from './pricing';
import { sellerPayoutStatus } from './sellerPayoutStatus';
import { connectedAccountStatus } from './sellerPayoutsCore';
import { buildAdminPayoutSummary, summarizeSellerAccounting } from './sellerDashboardCore';

function safeParse(s: string): string[] {
  try {
    const value = JSON.parse(s);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export async function getSellerDashboardView(sellerId: string) {
  const [seller, rows] = await Promise.all([
    prisma.seller.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        email: true,
        name: true,
        bio: true,
        backgroundTags: true,
        stripeAccountId: true,
      },
    }),
    prisma.listing.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: { essays: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);
  if (!seller) return null;

  const purchases = await prisma.purchase.findMany({
    where: {
      listingId: { in: rows.map((listing) => listing.id) },
      stripeSessionId: { startsWith: 'cs_live_' },
    },
    select: {
      listingId: true,
      essayId: true,
      amount: true,
      grossAmountCents: true,
      sellerEarningsCents: true,
      platformFeeCents: true,
      stripeProcessingFeeCents: true,
      sellerShareBps: true,
      checkoutVersion: true,
      currency: true,
      createdAt: true,
      sellerTransferredAt: true,
      sellerTransferReversedCents: true,
      sellerTransferLastError: true,
    },
  });

  const accountedPurchases = purchases
    .filter((purchase) => !purchaseAccountingPending(purchase))
    .map((purchase) => ({
      ...purchase,
      ...purchaseAccounting(purchase),
      currency: purchase.currency || 'usd',
    }));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const accountingSummary = summarizeSellerAccounting(accountedPurchases, monthStart);
  const sum = (
    items: typeof accountedPurchases,
    key: 'grossAmountCents' | 'sellerEarningsCents' | 'platformFeeCents' | 'stripeProcessingFeeCents',
  ) =>
    items.reduce((total, item) => total + item[key], 0);

  const payouts = await sellerPayoutStatus(seller.id);
  if (!payouts) return null;
  const latestError = accountedPurchases
    .filter((purchase) => purchase.sellerTransferLastError)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.sellerTransferLastError;

  const listings = rows.map((listing) => {
    const allForListing = purchases.filter((purchase) => purchase.listingId === listing.id);
    const forListing = accountedPurchases.filter((purchase) => purchase.listingId === listing.id);
    const grossCents = sum(forListing, 'grossAmountCents');
    const sellerEarningsCents = sum(forListing, 'sellerEarningsCents');
    const platformFeeCents = sum(forListing, 'platformFeeCents');
    const stripeProcessingFeeCents = sum(forListing, 'stripeProcessingFeeCents');
    return {
      id: listing.id,
      school: listing.school,
      targetSchool: listing.targetSchool,
      applicationSystem: listing.applicationSystem,
      status: listing.status,
      pricingMode: listing.pricingMode,
      packagePrice: listing.packagePrice,
      admitTags: safeParse(listing.admitTags),
      adminNote: listing.adminNote,
      createdAt: listing.createdAt,
      sales: allForListing.length,
      gross: grossCents / 100,
      grossCents,
      sellerEarningsCents,
      platformFeeCents,
      stripeProcessingFeeCents,
      essays: listing.essays.map((essay) => {
        const forEssay = forListing.filter((purchase) => purchase.essayId === essay.id);
        const essayGrossCents = sum(forEssay, 'grossAmountCents');
        return {
          id: essay.id,
          prompt: essay.prompt,
          question: essay.question,
          price: essay.price,
          sales: forEssay.length,
          gross: essayGrossCents / 100,
          grossCents: essayGrossCents,
          sellerEarningsCents: sum(forEssay, 'sellerEarningsCents'),
          platformFeeCents: sum(forEssay, 'platformFeeCents'),
          stripeProcessingFeeCents: sum(forEssay, 'stripeProcessingFeeCents'),
        };
      }),
    };
  });

  return {
    seller: {
      id: seller.id,
      email: seller.email,
      name: seller.name,
      bio: seller.bio,
      backgroundTags: safeParse(seller.backgroundTags),
    },
    dashboard: {
      listings,
      currency: 'usd',
      sellerShareBps: SELLER_SHARE_BPS,
      ...accountingSummary,
      monthGross: accountingSummary.monthGrossCents / 100,
      payouts,
    },
    adminPayout: buildAdminPayoutSummary({
      status: payouts.status,
      stripeAccountId: seller.stripeAccountId,
      pendingCents: payouts.pendingCents,
      paidCents: payouts.paidCents,
      latestTransferError: latestError,
    }),
  };
}

export async function getSellerDirectory() {
  const sellers = await prisma.seller.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      stripeAccountId: true,
      stripeOnboardingCompleteAt: true,
      stripePayoutsEnabled: true,
      listings: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          school: true,
          major: true,
          status: true,
          purchases: {
            where: { stripeSessionId: { startsWith: 'cs_live_' } },
            select: {
              amount: true,
              grossAmountCents: true,
              sellerEarningsCents: true,
              platformFeeCents: true,
              stripeProcessingFeeCents: true,
              sellerShareBps: true,
              checkoutVersion: true,
              sellerTransferredAt: true,
              sellerTransferReversedCents: true,
              sellerTransferLastError: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  return sellers.map((seller) => {
    const allPurchases = seller.listings.flatMap((listing) => listing.purchases);
    const purchases = allPurchases
      .filter((purchase) => !purchaseAccountingPending(purchase))
      .map((purchase) => ({
        ...purchase,
        accounting: purchaseAccounting(purchase),
      }));
    const paidCents = purchases.reduce(
      (total, purchase) => total + (purchase.sellerTransferredAt
        ? purchase.accounting.sellerEarningsCents - purchase.sellerTransferReversedCents
        : 0),
      0,
    );
    const pendingCents = purchases.reduce(
      (total, purchase) => total + (!purchase.sellerTransferredAt ? purchase.accounting.sellerEarningsCents : 0),
      0,
    );
    const status = connectedAccountStatus({
      liveSaleCount: allPurchases.length,
      stripeAccountId: seller.stripeAccountId,
      onboardingComplete: Boolean(seller.stripeOnboardingCompleteAt),
      payoutsEnabled: seller.stripePayoutsEnabled,
    });
    const latestError = purchases
      .filter((purchase) => purchase.sellerTransferLastError)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.sellerTransferLastError;
    const newestListing = seller.listings[0];

    return {
      id: seller.id,
      email: seller.email,
      name: seller.name,
      school: newestListing?.school ?? null,
      major: newestListing?.major ?? null,
      listingCount: seller.listings.length,
      publishedListingCount: seller.listings.filter((listing) => listing.status === 'approved').length,
      liveSaleCount: allPurchases.length,
      payoutStatus: status,
      payout: buildAdminPayoutSummary({
        status,
        stripeAccountId: seller.stripeAccountId,
        pendingCents,
        paidCents,
        latestTransferError: latestError,
      }),
    };
  });
}
