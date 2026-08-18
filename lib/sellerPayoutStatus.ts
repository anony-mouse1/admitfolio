import 'server-only';
import { prisma } from './prisma';
import { connectedAccountStatus } from './sellerPayoutsCore';
import { purchaseAccounting } from './commerce';

export async function sellerPayoutStatus(sellerId: string) {
  const [seller, purchases] = await Promise.all([
    prisma.seller.findUnique({
      where: { id: sellerId },
      select: {
        stripeAccountId: true,
        stripeOnboardingCompleteAt: true,
        stripePayoutsEnabled: true,
      },
    }),
    prisma.purchase.findMany({
      where: {
        listing: { sellerId },
        stripeSessionId: { startsWith: 'cs_live_' },
      },
      select: {
        amount: true,
        grossAmountCents: true,
        sellerEarningsCents: true,
        platformFeeCents: true,
        sellerShareBps: true,
        stripeTransferId: true,
        sellerTransferredAt: true,
        sellerTransferReversedCents: true,
      },
    }),
  ]);
  if (!seller) return null;

  const accounted = purchases.map((purchase) => ({
    ...purchase,
    accounting: purchaseAccounting(purchase),
  }));
  const paidCents = accounted.reduce(
    (sum, purchase) => sum + (purchase.sellerTransferredAt
      ? purchase.accounting.sellerEarningsCents - purchase.sellerTransferReversedCents
      : 0),
    0,
  );
  const pendingCents = accounted.reduce(
    (sum, purchase) => sum + (!purchase.sellerTransferredAt ? purchase.accounting.sellerEarningsCents : 0),
    0,
  );
  const status = connectedAccountStatus({
    liveSaleCount: purchases.length,
    stripeAccountId: seller.stripeAccountId,
    onboardingComplete: Boolean(seller.stripeOnboardingCompleteAt),
    payoutsEnabled: seller.stripePayoutsEnabled,
  });

  return {
    status,
    setupAvailable: purchases.length > 0,
    liveSaleCount: purchases.length,
    pendingCents,
    paidCents,
  };
}
