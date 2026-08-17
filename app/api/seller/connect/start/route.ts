import { NextResponse } from 'next/server';
import { currentSeller } from '@/lib/sellerAuth';
import { prisma } from '@/lib/prisma';
import { sellerPayoutStatus } from '@/lib/sellerPayoutStatus';
import { stripe, SITE_URL } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST() {
  const session = currentSeller();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!stripe) return NextResponse.json({ error: 'Payout setup is not configured yet.' }, { status: 503 });

  const seller = await prisma.seller.findUnique({
    where: { email: session.email },
    select: { id: true, email: true, stripeAccountId: true },
  });
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = await sellerPayoutStatus(seller.id);
  if (!status?.setupAvailable) {
    return NextResponse.json(
      { error: 'Payout setup becomes available after your first sale.' },
      { status: 403 },
    );
  }
  if (status.status === 'ready') {
    return NextResponse.json({ ok: true, alreadyReady: true });
  }

  let accountId = seller.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create(
      {
        type: 'express',
        email: seller.email,
        capabilities: { transfers: { requested: true } },
        metadata: { sellerId: seller.id, platform: 'admitfolio' },
      },
      { idempotencyKey: `admitfolio-connect-account-${seller.id}` },
    );
    accountId = account.id;
    await prisma.seller.update({
      where: { id: seller.id },
      data: {
        stripeAccountId: account.id,
        stripeOnboardingStartedAt: new Date(),
      },
    });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${SITE_URL}/api/seller/connect/refresh`,
    return_url: `${SITE_URL}/api/seller/connect/return`,
    type: 'account_onboarding',
  });
  return NextResponse.json({ ok: true, url: link.url });
}
